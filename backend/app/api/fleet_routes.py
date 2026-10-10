"""
Fleet Owner & Multi-Vehicle Battery Intelligence API Routes for EVolve AI.

Supports:
  1. Private dataset upload (CSV) with file size, row count, and column inspection.
  2. Strict server-side validation (formats, missing fields, duplicates, range checks, row-level errors).
  3. Interactive column mapping to the authoritative 14-feature ML schema.
  4. Multi-vehicle batch prediction using trained ModelBundle & prevention engine with graceful error handling.
  5. Fleet dashboard analytics (overview KPIs, health distribution, vehicle priority list, maintenance planner).
  6. Side-by-side vehicle comparison and secure CSV export.
  7. History tracking and isolated dataset deletion.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import math
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config
from ..database.base import get_db
from ..database.models import FleetAnalysis, FleetUpload, FleetVehicleRecord, User
from ..ml.trainer import FEATURE_COLUMNS, ModelBundle
from ..services.auth import get_optional_current_user
from ..services.battery_feature_estimator import (
    CURRENT_MONTH,
    CURRENT_YEAR,
    DEFAULT_AMBIENT_TEMP,
    estimate_battery_features,
    lookup_ambient_temp,
    lookup_vehicle_spec,
)
from ..services.prevention import decide_pathway

logger = logging.getLogger("evolve.fleet")

router = APIRouter(prefix="/api/fleet", tags=["Fleet Intelligence"])


# ---------------------------------------------------------------------------
# Helper: CSV Formula Injection Sanitization
# ---------------------------------------------------------------------------

def _sanitize_csv_cell(value: Any) -> str:
    """Neutralize spreadsheet formula injection characters (=, +, -, @, tab, cr)."""
    if value is None:
        return ""
    val_str = str(value)
    if val_str and val_str[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{val_str}"
    return val_str


# ---------------------------------------------------------------------------
# Standard Canonical Feature Schema for Column Mapping
# ---------------------------------------------------------------------------

CANONICAL_COLUMNS: dict[str, dict[str, Any]] = {
    "vehicle_id": {
        "label": "Vehicle Identifier",
        "required": True,
        "description": "Unique vehicle ID, VIN, or registration number (e.g. EV-101, TS09AB1234)",
        "aliases": ["vehicle_id", "vin", "vehicle_no", "veh_id", "id", "reg_no", "registration_no", "vehicle_number", "bus_id"],
    },
    "battery_id": {
        "label": "Battery Identifier",
        "required": False,
        "description": "Unique battery pack serial number (optional)",
        "aliases": ["battery_id", "pack_id", "serial_no", "battery_serial", "pack_serial", "bms_id"],
    },
    "model_name": {
        "label": "Vehicle Model",
        "required": False,
        "description": "Make and model (e.g. Tata Nexon EV, MG ZS EV)",
        "aliases": ["model_name", "model", "vehicle_model", "make_model", "ev_model", "type"],
    },
    "odometer_km": {
        "label": "Odometer (km)",
        "required": False,
        "description": "Total distance traveled in kilometers",
        "aliases": ["odometer_km", "odometer", "mileage_km", "kms", "total_km", "distance_km", "annual_distance_km"],
    },
    "months_in_service": {
        "label": "Months in Service",
        "required": False,
        "description": "Operational age in months (or purchase year / registration date)",
        "aliases": ["months_in_service", "age_months", "months", "service_months", "purchase_year", "year"],
    },
    "daily_km": {
        "label": "Daily Driving (km/day)",
        "required": False,
        "description": "Average daily distance in km",
        "aliases": ["daily_km", "daily_distance_km", "avg_daily_km", "km_per_day"],
    },
    "equivalent_full_cycles": {
        "label": "Equivalent Full Cycles",
        "required": False,
        "description": "Cumulative charge/discharge full cycles",
        "aliases": ["equivalent_full_cycles", "cycles", "charging_cycles", "cycle_count", "total_cycles"],
    },
    "soh_pct": {
        "label": "State of Health (SOH %)",
        "required": False,
        "description": "Measured SOH percentage if available from BMS",
        "aliases": ["soh_pct", "soh", "state_of_health", "soh_percent", "measured_soh"],
    },
    "avg_cell_temp_c": {
        "label": "Average Cell Temp (°C)",
        "required": False,
        "description": "Mean operational cell temperature",
        "aliases": ["avg_cell_temp_c", "cell_temp_c", "battery_temp_c", "avg_temp", "temp_c", "temperature"],
    },
    "peak_cell_temp_c": {
        "label": "Peak Cell Temp (°C)",
        "required": False,
        "description": "Maximum recorded cell temperature",
        "aliases": ["peak_cell_temp_c", "max_cell_temp_c", "max_temp_c", "peak_temp_c", "highest_temp"],
    },
    "cell_voltage_spread_mv": {
        "label": "Voltage Imbalance (mV)",
        "required": False,
        "description": "Maximum cell voltage delta in millivolts",
        "aliases": ["cell_voltage_spread_mv", "voltage_spread_mv", "delta_v_mv", "cell_imbalance_mv", "voltage_delta_mv"],
    },
    "dc_resistance_mohm": {
        "label": "DC Resistance (mΩ)",
        "required": False,
        "description": "Internal pack/cell impedance in milliohms",
        "aliases": ["dc_resistance_mohm", "internal_resistance_mohm", "resistance_mohm", "ir_mohm", "impedance_mohm"],
    },
    "fast_charge_ratio": {
        "label": "Fast Charge Ratio (0-1)",
        "required": False,
        "description": "Proportion of DC fast charging sessions",
        "aliases": ["fast_charge_ratio", "dc_fast_charge_pct", "fast_charge_pct", "fast_charging_ratio"],
    },
    "depth_of_discharge": {
        "label": "Depth of Discharge (0-1)",
        "required": False,
        "description": "Average discharge depth per cycle",
        "aliases": ["depth_of_discharge", "dod", "dod_pct", "discharge_depth"],
    },
    "city": {
        "label": "Operating City / Region",
        "required": False,
        "description": "City for ambient thermal baseline lookup",
        "aliases": ["city", "location", "operating_city", "zone", "region", "state"],
    },
}


def _auto_detect_mappings(headers: list[str]) -> dict[str, str]:
    """Match CSV headers to canonical schema fields using aliases."""
    normalized_headers = {h.strip().lower().replace(" ", "_").replace("-", "_"): h for h in headers}
    mapping: dict[str, str] = {}

    for canon_key, spec in CANONICAL_COLUMNS.items():
        found = False
        for alias in spec["aliases"]:
            if alias in normalized_headers:
                mapping[canon_key] = normalized_headers[alias]
                found = True
                break
        if not found:
            # Fuzzy match: header contains canon_key
            for norm_h, orig_h in normalized_headers.items():
                if canon_key in norm_h and canon_key not in mapping:
                    mapping[canon_key] = orig_h
                    break
    return mapping


# ---------------------------------------------------------------------------
# 1. Dataset Upload Route
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_fleet_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """
    Accepts a user-uploaded CSV dataset for fleet analysis.
    Performs initial CSV decoding, header inspection, and row counting.
    Does NOT execute prediction automatically.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a valid CSV file (.csv).",
        )

    content = await file.read()
    file_size = len(content)

    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty. Please provide a CSV file containing vehicle records.",
        )

    if file_size > 15 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 15 MB limit. Please split your dataset or reduce row count.",
        )

    # Decode with fallback encoding strategies
    text: str | None = None
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue

    if text is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not decode the CSV file. Please ensure standard UTF-8 encoding.",
        )

    # Parse rows using csv.reader
    try:
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV: {str(e)}",
        )

    if not rows or len(rows) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The file must contain a header row and at least one vehicle data row.",
        )

    headers = [h.strip() for h in rows[0]]
    if not any(headers):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV header row is empty or invalid.",
        )

    raw_data_rows: list[dict[str, Any]] = []
    for row_idx, r in enumerate(rows[1:], start=1):
        if not any(cell.strip() for cell in r):
            continue  # skip completely blank rows
        # Pad row if shorter than headers, or trim if longer
        row_dict = {}
        for col_idx, h in enumerate(headers):
            row_dict[h] = r[col_idx].strip() if col_idx < len(r) else ""
        raw_data_rows.append(row_dict)

    if not raw_data_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded CSV file contains no usable vehicle data rows.",
        )

    upload_id = f"flt_up_{uuid.uuid4().hex[:16]}"
    auto_mappings = _auto_detect_mappings(headers)

    fleet_upload = FleetUpload(
        upload_id=upload_id,
        user_id=current_user.id if current_user else None,
        filename=file.filename,
        file_size_bytes=file_size,
        total_rows=len(raw_data_rows),
        valid_rows=0,
        error_rows=0,
        status="UPLOADED",
        raw_data_json=json.dumps(raw_data_rows),
        detected_columns_json=json.dumps(headers),
        column_mapping_json=json.dumps(auto_mappings),
        validation_report_json="{}",
    )

    db.add(fleet_upload)
    db.commit()

    return {
        "upload_id": upload_id,
        "filename": file.filename,
        "file_size": file_size,
        "total_rows": len(raw_data_rows),
        "detected_columns": headers,
        "auto_mapping": auto_mappings,
        "preview_rows": raw_data_rows[:5],
        "message": f"Successfully received {len(raw_data_rows)} vehicle rows. Proceed to validation.",
    }


# ---------------------------------------------------------------------------
# 2. Dataset Validation Route
# ---------------------------------------------------------------------------

@router.post("/uploads/{upload_id}/validate")
def validate_fleet_dataset(
    upload_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """
    Validates the uploaded dataset:
      - Required vehicle identifier presence
      - Duplicate identifiers
      - Missing values per column
      - Invalid numeric types & out-of-range sensor readings
      - Distinguishes valid rows vs error rows with row-level diagnostics
    """
    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    rows: list[dict[str, Any]] = json.loads(upload.raw_data_json)
    headers: list[str] = json.loads(upload.detected_columns_json)
    mappings: dict[str, str] = json.loads(upload.column_mapping_json)

    # 1. Determine vehicle ID column
    veh_col = mappings.get("vehicle_id")
    if not veh_col or veh_col not in headers:
        # Try finding one from headers
        for h in headers:
            h_norm = h.strip().lower().replace(" ", "_")
            if any(alias in h_norm for alias in CANONICAL_COLUMNS["vehicle_id"]["aliases"]):
                veh_col = h
                mappings["vehicle_id"] = h
                break

    if not veh_col:
        return {
            "upload_id": upload_id,
            "status": "ERRORS",
            "can_proceed": False,
            "total_rows": len(rows),
            "valid_rows": 0,
            "error_rows": len(rows),
            "missing_values_by_column": {},
            "duplicate_identifiers": [],
            "unrecognized_columns": headers,
            "row_errors": [
                {
                    "row_number": 1,
                    "vehicle_id": "N/A",
                    "column": "vehicle_id",
                    "issue": "Missing required unique vehicle or battery identifier column.",
                    "severity": "CRITICAL",
                }
            ],
            "message": "Validation failed: No vehicle identifier column found. Please map a vehicle ID column.",
        }

    # 2. Check duplicates and row integrity
    seen_ids: dict[str, int] = {}
    duplicate_ids: set[str] = set()
    missing_by_col: dict[str, int] = {h: 0 for h in headers}
    row_errors: list[dict[str, Any]] = []
    valid_row_indices: list[int] = []
    error_row_indices: list[int] = []

    # Numeric range rules
    range_rules = {
        "soh_pct": (10.0, 100.0, "SOH % must be between 10% and 100%"),
        "odometer_km": (0.0, 1_500_000.0, "Odometer must be non-negative (≤ 1.5M km)"),
        "months_in_service": (0.0, 240.0, "Months in service must be between 0 and 240"),
        "daily_km": (0.0, 2_000.0, "Daily distance must be between 0 and 2000 km"),
        "equivalent_full_cycles": (0.0, 10_000.0, "Cycles must be non-negative (≤ 10,000)"),
        "avg_cell_temp_c": (-30.0, 90.0, "Temperature must be between -30°C and 90°C"),
        "peak_cell_temp_c": (-30.0, 95.0, "Peak temperature must be between -30°C and 95°C"),
        "cell_voltage_spread_mv": (0.0, 1_500.0, "Voltage spread must be non-negative (≤ 1500 mV)"),
        "dc_resistance_mohm": (1.0, 500.0, "DC resistance must be between 1 and 500 mΩ"),
        "fast_charge_ratio": (0.0, 1.0, "Fast charge ratio must be between 0.0 and 1.0"),
        "depth_of_discharge": (0.0, 1.0, "Depth of discharge must be between 0.0 and 1.0"),
    }

    # Invert mapping to find which canonical key a header maps to
    inv_mappings = {v: k for k, v in mappings.items()}

    for idx, r in enumerate(rows):
        row_num = idx + 1
        row_has_fatal_error = False
        veh_id = str(r.get(veh_col, "")).strip()

        # Check vehicle ID presence
        if not veh_id or veh_id.lower() in ("nan", "null", "none", ""):
            row_errors.append({
                "row_number": row_num,
                "vehicle_id": "MISSING",
                "column": veh_col,
                "issue": "Vehicle identifier is blank or missing.",
                "severity": "ERROR",
            })
            row_has_fatal_error = True
        else:
            if veh_id in seen_ids:
                duplicate_ids.add(veh_id)
                row_errors.append({
                    "row_number": row_num,
                    "vehicle_id": veh_id,
                    "column": veh_col,
                    "issue": f"Duplicate vehicle identifier '{veh_id}' (first seen at row {seen_ids[veh_id]}).",
                    "severity": "ERROR",
                })
                row_has_fatal_error = True
            else:
                seen_ids[veh_id] = row_num

        # Check column missing values and numeric ranges
        for h in headers:
            val = str(r.get(h, "")).strip()
            if not val or val.lower() in ("nan", "null", "none"):
                missing_by_col[h] += 1
                continue

            canon_key = inv_mappings.get(h)
            if canon_key and canon_key in range_rules:
                min_v, max_v, msg = range_rules[canon_key]
                try:
                    num_val = float(val)
                    if math.isnan(num_val) or math.isinf(num_val) or num_val < min_v or num_val > max_v:
                        row_errors.append({
                            "row_number": row_num,
                            "vehicle_id": veh_id or f"Row {row_num}",
                            "column": h,
                            "issue": f"Invalid range ({val}): {msg}",
                            "severity": "WARNING",
                        })
                except ValueError:
                    row_errors.append({
                        "row_number": row_num,
                        "vehicle_id": veh_id or f"Row {row_num}",
                        "column": h,
                        "issue": f"Expected numeric value, received '{val}'.",
                        "severity": "WARNING",
                    })

        if row_has_fatal_error:
            error_row_indices.append(idx)
        else:
            valid_row_indices.append(idx)

    total_count = len(rows)
    valid_count = len(valid_row_indices)
    error_count = len(error_row_indices)

    # Determine unrecognized columns
    mapped_headers = set(mappings.values())
    unrecognized = [h for h in headers if h not in mapped_headers]

    overall_status = "PASSED" if error_count == 0 and len(row_errors) == 0 else "WARNINGS" if valid_count > 0 else "ERRORS"

    report = {
        "upload_id": upload_id,
        "status": overall_status,
        "can_proceed": valid_count > 0,
        "total_rows": total_count,
        "valid_rows": valid_count,
        "error_rows": error_count,
        "missing_values_by_column": missing_by_col,
        "duplicate_identifiers": sorted(list(duplicate_ids)),
        "unrecognized_columns": unrecognized,
        "row_errors": row_errors[:100],  # cap diagnostic errors for payload size
        "total_diagnostic_issues": len(row_errors),
        "valid_row_indices": valid_row_indices,
        "error_row_indices": error_row_indices,
    }

    upload.valid_rows = valid_count
    upload.error_rows = error_count
    upload.status = "VALIDATED"
    upload.column_mapping_json = json.dumps(mappings)
    upload.validation_report_json = json.dumps(report)
    db.commit()

    return report


# ---------------------------------------------------------------------------
# 3. Data Preview Route (Paginated)
# ---------------------------------------------------------------------------

@router.get("/uploads/{upload_id}/preview")
def get_fleet_upload_preview(
    upload_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Provides paginated inspection of the raw uploaded records."""
    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    rows: list[dict[str, Any]] = json.loads(upload.raw_data_json)
    headers: list[str] = json.loads(upload.detected_columns_json)
    mappings: dict[str, str] = json.loads(upload.column_mapping_json)

    total = len(rows)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total)
    paginated_rows = rows[start_idx:end_idx]

    return {
        "upload_id": upload_id,
        "filename": upload.filename,
        "total_rows": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
        "headers": headers,
        "column_mapping": mappings,
        "rows": paginated_rows,
    }


# ---------------------------------------------------------------------------
# 4. Download Validation Error Report
# ---------------------------------------------------------------------------

@router.get("/uploads/{upload_id}/error-report")
def download_validation_error_report(
    upload_id: str,
    db: Session = Depends(get_db),
):
    """Generates a downloadable CSV audit report of all row-level validation issues."""
    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    report = json.loads(upload.validation_report_json or "{}")
    row_errors = report.get("row_errors", [])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Row Number", "Vehicle ID", "Column", "Severity", "Validation Issue"])

    for err in row_errors:
        writer.writerow([
            err.get("row_number", ""),
            _sanitize_csv_cell(err.get("vehicle_id", "")),
            err.get("column", ""),
            err.get("severity", ""),
            _sanitize_csv_cell(err.get("issue", "")),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=validation_errors_{upload_id}.csv"},
    )


# ---------------------------------------------------------------------------
# 5. Column Mapping Update Route
# ---------------------------------------------------------------------------

class ColumnMappingRequest(BaseModel):
    mapping: dict[str, str]


@router.post("/uploads/{upload_id}/map-columns")
def update_column_mapping(
    upload_id: str,
    body: ColumnMappingRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Stores user-confirmed column mappings between uploaded CSV headers and the ML schema."""
    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    headers = json.loads(upload.detected_columns_json)
    cleaned_mapping = {k: v for k, v in body.mapping.items() if v in headers}

    if "vehicle_id" not in cleaned_mapping or not cleaned_mapping["vehicle_id"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must map at least one column as the unique Vehicle Identifier.",
        )

    upload.column_mapping_json = json.dumps(cleaned_mapping)
    upload.status = "MAPPED"
    db.commit()

    return {
        "upload_id": upload_id,
        "mapped_columns": cleaned_mapping,
        "canonical_fields": list(CANONICAL_COLUMNS.keys()),
        "message": "Column mapping saved successfully.",
    }


# ---------------------------------------------------------------------------
# 6. Execute Multi-Vehicle Batch Prediction Engine
# ---------------------------------------------------------------------------

class RunFleetAnalysisRequest(BaseModel):
    upload_id: str
    exclude_error_rows: bool = True


@router.post("/analyses")
def run_fleet_analysis(
    body: RunFleetAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """
    Executes batch prediction across all eligible vehicles in the uploaded dataset.
    Explicit confirmation: only runs when the user clicks 'Run Fleet Analysis'.
    Uses trained ModelBundle and prevention pathways.
    Handles per-record failures gracefully without aborting the entire batch.
    """
    bundle = ModelBundle()
    if not bundle.ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML models are not loaded. Please wait for model initialization or run model training.",
        )

    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == body.upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    raw_rows: list[dict[str, Any]] = json.loads(upload.raw_data_json)
    mappings: dict[str, str] = json.loads(upload.column_mapping_json)
    validation_report = json.loads(upload.validation_report_json or "{}")

    error_indices = set(validation_report.get("error_row_indices", []))
    veh_col = mappings.get("vehicle_id")

    analysis_id = f"flt_an_{uuid.uuid4().hex[:16]}"
    analysis = FleetAnalysis(
        analysis_id=analysis_id,
        upload_id=upload.id,
        user_id=current_user.id if current_user else None,
        status="RUNNING",
        total_vehicles=len(raw_rows),
    )
    db.add(analysis)
    db.flush()

    vehicle_records: list[FleetVehicleRecord] = []
    soh_values: list[float] = []
    eol_values: list[float] = []
    critical_count = 0
    attention_count = 0
    normal_count = 0
    failed_count = 0

    soh_bins = {"<70%": 0, "70-79%": 0, "80-89%": 0, "90-100%": 0}
    pathway_counts: dict[str, int] = {}
    risk_counts: dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}

    for idx, raw_row in enumerate(raw_rows):
        # Skip error rows if user elected to exclude them
        if body.exclude_error_rows and idx in error_indices:
            continue

        veh_id = str(raw_row.get(veh_col, f"VEH-{idx+1}")).strip() if veh_col else f"VEH-{idx+1}"
        battery_id_col = mappings.get("battery_id")
        battery_id = str(raw_row.get(battery_id_col, "")).strip() if battery_id_col else None
        model_col = mappings.get("model_name")
        model_name = str(raw_row.get(model_col, "")).strip() if model_col else None

        try:
            # 1. Transform raw row using column mappings into feature estimation dictionary
            est_input: dict[str, Any] = {
                "vehicle_model": model_name,
                "city": raw_row.get(mappings.get("city", ""), ""),
            }

            # Map direct numbers if provided
            for canon_key in ("odometer_km", "months_in_service", "daily_km", "equivalent_full_cycles",
                              "soh_pct", "avg_cell_temp_c", "peak_cell_temp_c", "cell_voltage_spread_mv",
                              "dc_resistance_mohm", "fast_charge_ratio", "depth_of_discharge"):
                csv_col = mappings.get(canon_key)
                if csv_col and raw_row.get(csv_col):
                    try:
                        val_num = float(raw_row[csv_col])
                        if canon_key == "soh_pct":
                            est_input["soh_input"] = val_num
                        elif canon_key == "avg_cell_temp_c":
                            est_input["temperature_input"] = val_num
                        elif canon_key == "dc_resistance_mohm":
                            est_input["internal_resistance_mohm"] = val_num
                        elif canon_key == "cell_voltage_spread_mv":
                            est_input["voltage_input"] = val_num
                            est_input["cell_voltage_spread_mv"] = val_num
                        elif canon_key == "depth_of_discharge":
                            est_input["dod_input"] = val_num
                        else:
                            est_input[canon_key] = val_num
                    except (ValueError, TypeError):
                        pass

            # 2. Derive 14 model features using estimation service
            est_result = estimate_battery_features(est_input)
            features = est_result["features"]

            # Overwrite features directly if explicitly provided in CSV
            for canon_f in FEATURE_COLUMNS:
                csv_col = mappings.get(canon_f)
                if csv_col and raw_row.get(csv_col):
                    try:
                        features[canon_f] = float(raw_row[csv_col])
                    except (ValueError, TypeError):
                        pass

            # Ensure temp rise is consistent
            features["temp_rise_over_ambient_c"] = round(
                features["peak_cell_temp_c"] - features["ambient_temp_c"], 1
            )

            # 3. Predict via ModelBundle
            feat_df = pd.DataFrame([features])
            preds = bundle.predict(feat_df)

            pred_soh = float(preds["soh"][0])
            pred_eol = float(preds["eol"][0])
            pred_anom = float(preds["anomaly"][0])

            # If user provided high-trust direct SOH, respect it blended with ML
            if est_input.get("soh_input") is not None:
                user_soh = float(est_input["soh_input"])
                if user_soh > 1.0:
                    user_soh /= 100.0
                pred_soh = round(0.7 * user_soh + 0.3 * pred_soh, 4)

            soh_pct = round(pred_soh * 100.0, 1)
            eol_months = round(pred_eol, 1)
            anomaly_score = round(pred_anom, 3)

            # 4. Prevention Pathway Engine
            pathway_record = {
                "battery_id": battery_id or f"BAT-{veh_id}",
                "vehicle_id": veh_id,
                "soh_pct": soh_pct,
                "battery_age_months": features.get("months_in_service", 24),
                "charging_cycles": features.get("equivalent_full_cycles", 300),
                "anomaly_score": anomaly_score,
                "eol_in_months": eol_months,
                "data_confidence": 0.85,
                "temperature": {"history_max_c": features.get("peak_cell_temp_c", 35.0)},
            }
            pathway_result = decide_pathway(pathway_record)
            pathway = pathway_result["pathway"]
            pathway_label = pathway_result["pathway_label"]

            # 5. Prioritization & Alert Reasons
            alert_reasons: list[str] = []
            if soh_pct < 70.0:
                health_band = "Critical"
                alert_reasons.append(f"SOH ({soh_pct}%) dropped below 70% traction floor.")
            elif soh_pct < 80.0:
                health_band = "Attention"
                alert_reasons.append(f"Capacity degradation progressing (SOH: {soh_pct}%).")
            else:
                health_band = "Good"

            if anomaly_score >= 0.45:
                alert_reasons.append(f"Significant cell impedance/thermal anomaly (Severity: {anomaly_score:.2f}).")
            if features.get("cell_voltage_spread_mv", 0) > 60.0:
                alert_reasons.append(f"High cell voltage imbalance ({features['cell_voltage_spread_mv']} mV).")
            if eol_months <= 6.0:
                alert_reasons.append(f"Imminent end-of-life horizon (Estimated RUL: {eol_months} months).")
            if features.get("peak_cell_temp_c", 0) >= 44.0:
                alert_reasons.append(f"High peak operating temperature ({features['peak_cell_temp_c']}°C).")

            # Risk tier
            if health_band == "Critical" or anomaly_score >= 0.50 or eol_months <= 4.0:
                future_risk = "CRITICAL"
                priority_cat = "Critical"
                critical_count += 1
            elif health_band == "Attention" or anomaly_score >= 0.28 or eol_months <= 12.0:
                future_risk = "HIGH" if anomaly_score >= 0.35 else "MEDIUM"
                priority_cat = "Attention"
                attention_count += 1
            else:
                future_risk = "LOW"
                priority_cat = "Normal"
                normal_count += 1

            if not alert_reasons:
                alert_reasons.append("Pack operating within nominal electrochemical parameters.")

            # Binning
            if soh_pct < 70.0:
                soh_bins["<70%"] += 1
            elif soh_pct < 80.0:
                soh_bins["70-79%"] += 1
            elif soh_pct < 90.0:
                soh_bins["80-89%"] += 1
            else:
                soh_bins["90-100%"] += 1

            pathway_counts[pathway] = pathway_counts.get(pathway, 0) + 1
            risk_counts[future_risk] = risk_counts.get(future_risk, 0) + 1

            soh_values.append(soh_pct)
            eol_values.append(eol_months)

            rec_actions = pathway_result.get("actions", [])
            recommended_action = rec_actions[0] if rec_actions else "Continue standard scheduled monitoring."

            rec = FleetVehicleRecord(
                analysis_id=analysis.id,
                vehicle_id=veh_id,
                battery_id=battery_id,
                model_name=model_name or "EV Battery Pack",
                raw_data_json=json.dumps(raw_row),
                mapped_features_json=json.dumps(features),
                soh_pct=soh_pct,
                soh_health_band=health_band,
                eol_months=eol_months,
                anomaly_score=anomaly_score,
                future_risk=future_risk,
                pathway=pathway,
                pathway_label=pathway_label,
                priority_category=priority_cat,
                recommended_action=recommended_action,
                recommendation_title=pathway_label,
                alert_reasons_json=json.dumps(alert_reasons),
                status="SUCCESS",
            )
            vehicle_records.append(rec)

        except Exception as exc:
            logger.warning("Failed prediction for row %s (%s): %s", idx + 1, veh_id, exc)
            failed_count += 1
            rec = FleetVehicleRecord(
                analysis_id=analysis.id,
                vehicle_id=veh_id,
                battery_id=battery_id,
                model_name=model_name,
                raw_data_json=json.dumps(raw_row),
                mapped_features_json="{}",
                soh_pct=0.0,
                soh_health_band="Error",
                eol_months=0.0,
                anomaly_score=0.0,
                future_risk="UNKNOWN",
                pathway="ERROR",
                pathway_label="Analysis Failed",
                priority_category="Critical",
                recommended_action="Inspect raw vehicle telemetry for corrupted values.",
                recommendation_title="Telemetry Error",
                alert_reasons_json=json.dumps([f"Calculation error: {str(exc)}"]),
                status="FAILED",
                error_message=str(exc),
            )
            vehicle_records.append(rec)

    db.add_all(vehicle_records)

    analysed_count = len(vehicle_records) - failed_count
    avg_soh = round(float(np.mean(soh_values)), 1) if soh_values else 0.0
    avg_eol = round(float(np.mean(eol_values)), 1) if eol_values else 0.0

    summary_payload = {
        "analysis_id": analysis_id,
        "upload_id": upload.upload_id,
        "filename": upload.filename,
        "total_vehicles": len(raw_rows),
        "valid_records": len(vehicle_records),
        "analysed_count": analysed_count,
        "failed_count": failed_count,
        "requiring_attention": critical_count + attention_count,
        "critical_count": critical_count,
        "attention_count": attention_count,
        "normal_count": normal_count,
        "avg_soh_pct": avg_soh,
        "avg_eol_months": avg_eol,
        "soh_distribution": soh_bins,
        "pathway_distribution": pathway_counts,
        "risk_distribution": risk_counts,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    analysis.status = "COMPLETED"
    analysis.analysed_count = analysed_count
    analysis.failed_count = failed_count
    analysis.attention_count = critical_count + attention_count
    analysis.avg_soh_pct = avg_soh
    analysis.avg_eol_months = avg_eol
    analysis.summary_json = json.dumps(summary_payload)
    analysis.completed_at = datetime.now(timezone.utc)

    upload.status = "ANALYZED"
    db.commit()

    return summary_payload


# ---------------------------------------------------------------------------
# 7. Analysis Overview & Summary Route
# ---------------------------------------------------------------------------

@router.get("/analyses/{analysis_id}")
def get_fleet_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Returns the fleet analysis summary and aggregate health distributions."""
    analysis = db.query(FleetAnalysis).filter(FleetAnalysis.analysis_id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    return json.loads(analysis.summary_json or "{}")


# ---------------------------------------------------------------------------
# 8. Filterable Vehicle Priority List (Records)
# ---------------------------------------------------------------------------

@router.get("/analyses/{analysis_id}/records")
def get_fleet_analysis_records(
    analysis_id: str,
    search: str | None = None,
    priority: str | None = None,  # Critical, Attention, Normal
    health_band: str | None = None,  # Good, Attention, Critical
    pathway: str | None = None,
    sort_by: str = "soh_pct",  # soh_pct, eol_months, anomaly_score, vehicle_id
    sort_dir: str = "asc",  # asc, desc
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Returns paginated, searchable, and sortable vehicle records."""
    analysis = db.query(FleetAnalysis).filter(FleetAnalysis.analysis_id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    query = db.query(FleetVehicleRecord).filter(FleetVehicleRecord.analysis_id == analysis.id)

    if search:
        search_clean = f"%{search.strip().lower()}%"
        query = query.filter(
            (FleetVehicleRecord.vehicle_id.ilike(search_clean)) |
            (FleetVehicleRecord.model_name.ilike(search_clean)) |
            (FleetVehicleRecord.battery_id.ilike(search_clean))
        )

    if priority and priority != "All":
        query = query.filter(FleetVehicleRecord.priority_category == priority)

    if health_band and health_band != "All":
        query = query.filter(FleetVehicleRecord.soh_health_band == health_band)

    if pathway and pathway != "All":
        query = query.filter(FleetVehicleRecord.pathway == pathway)

    # Sorting
    sort_col = getattr(FleetVehicleRecord, sort_by, FleetVehicleRecord.soh_pct)
    if sort_dir.lower() == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    total = query.count()
    records = query.offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "vehicle_id": r.vehicle_id,
            "battery_id": r.battery_id,
            "model_name": r.model_name,
            "soh_pct": r.soh_pct,
            "soh_health_band": r.soh_health_band,
            "eol_months": r.eol_months,
            "anomaly_score": r.anomaly_score,
            "future_risk": r.future_risk,
            "pathway": r.pathway,
            "pathway_label": r.pathway_label,
            "priority_category": r.priority_category,
            "recommended_action": r.recommended_action,
            "recommendation_title": r.recommendation_title,
            "alert_reasons": json.loads(r.alert_reasons_json or "[]"),
            "status": r.status,
            "error_message": r.error_message,
        })

    return {
        "analysis_id": analysis_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size) if total > 0 else 1,
        "records": items,
    }


# ---------------------------------------------------------------------------
# 9. Vehicle Side-by-Side Comparison Route
# ---------------------------------------------------------------------------

@router.get("/analyses/{analysis_id}/comparison")
def compare_fleet_vehicles(
    analysis_id: str,
    vehicle_ids: str = Query(..., description="Comma-separated vehicle IDs (e.g. EV-101,EV-102)"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Returns side-by-side technical parameters and prediction metrics for selected vehicles."""
    analysis = db.query(FleetAnalysis).filter(FleetAnalysis.analysis_id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    target_ids = [v.strip() for v in vehicle_ids.split(",") if v.strip()][:5]
    records = db.query(FleetVehicleRecord).filter(
        FleetVehicleRecord.analysis_id == analysis.id,
        FleetVehicleRecord.vehicle_id.in_(target_ids),
    ).all()

    comparison_data = []
    for r in records:
        features = json.loads(r.mapped_features_json or "{}")
        comparison_data.append({
            "vehicle_id": r.vehicle_id,
            "battery_id": r.battery_id,
            "model_name": r.model_name,
            "soh_pct": r.soh_pct,
            "eol_months": r.eol_months,
            "anomaly_score": r.anomaly_score,
            "priority_category": r.priority_category,
            "pathway_label": r.pathway_label,
            "future_risk": r.future_risk,
            "recommended_action": r.recommended_action,
            "features": features,
            "alert_reasons": json.loads(r.alert_reasons_json or "[]"),
        })

    return {
        "analysis_id": analysis_id,
        "vehicles": comparison_data,
    }


# ---------------------------------------------------------------------------
# 10. Export Analysis Results as CSV
# ---------------------------------------------------------------------------

@router.get("/analyses/{analysis_id}/export")
def export_fleet_analysis_csv(
    analysis_id: str,
    db: Session = Depends(get_db),
):
    """Exports full vehicle predictions and circularity recommendations to a downloadable CSV."""
    analysis = db.query(FleetAnalysis).filter(FleetAnalysis.analysis_id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found.")

    records = db.query(FleetVehicleRecord).filter(FleetVehicleRecord.analysis_id == analysis.id).order_by(
        FleetVehicleRecord.soh_pct.asc()
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Vehicle ID",
        "Battery ID",
        "Model",
        "SOH (%)",
        "Health Band",
        "Remaining Useful Life (Months)",
        "Anomaly Severity (0-1)",
        "Future Risk Tier",
        "Circularity Pathway",
        "Priority Category",
        "Recommended Next Action",
        "Key Alert Reasons",
    ])

    for r in records:
        alerts = "; ".join(json.loads(r.alert_reasons_json or "[]"))
        writer.writerow([
            _sanitize_csv_cell(r.vehicle_id),
            _sanitize_csv_cell(r.battery_id or "N/A"),
            _sanitize_csv_cell(r.model_name or "EV Battery"),
            f"{r.soh_pct:.1f}",
            r.soh_health_band,
            f"{r.eol_months:.1f}",
            f"{r.anomaly_score:.3f}",
            r.future_risk,
            r.pathway_label,
            r.priority_category,
            _sanitize_csv_cell(r.recommended_action),
            _sanitize_csv_cell(alerts),
        ])

    output.seek(0)
    filename = f"fleet_analysis_{analysis_id}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------------------------------------------------------------------------
# 11. Fleet Analysis History Route
# ---------------------------------------------------------------------------

@router.get("/history")
def get_fleet_history(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> list[dict[str, Any]]:
    """Returns past fleet analyses for the authenticated user or local session."""
    query = db.query(FleetAnalysis).order_by(FleetAnalysis.created_at.desc())
    if current_user:
        query = query.filter(FleetAnalysis.user_id == current_user.id)

    analyses = query.limit(20).all()
    history = []
    for an in analyses:
        summary = json.loads(an.summary_json or "{}")
        upload = db.query(FleetUpload).filter(FleetUpload.id == an.upload_id).first()
        history.append({
            "analysis_id": an.analysis_id,
            "upload_id": upload.upload_id if upload else "N/A",
            "filename": upload.filename if upload else "Dataset",
            "total_vehicles": an.total_vehicles,
            "analysed_count": an.analysed_count,
            "attention_count": an.attention_count,
            "avg_soh_pct": an.avg_soh_pct,
            "avg_eol_months": an.avg_eol_months,
            "status": an.status,
            "created_at": an.created_at.isoformat() if an.created_at else "",
        })
    return history


# ---------------------------------------------------------------------------
# 12. Secure Deletion of Fleet Dataset & Analysis
# ---------------------------------------------------------------------------

@router.delete("/uploads/{upload_id}")
def delete_fleet_upload(
    upload_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> dict[str, Any]:
    """Permanently and securely deletes a private fleet dataset and its associated analyses."""
    upload = db.query(FleetUpload).filter(FleetUpload.upload_id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload session not found.")

    if current_user and upload.user_id and upload.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to delete this dataset.")

    db.delete(upload)
    db.commit()
    return {"message": "Dataset and all associated analysis records deleted successfully.", "upload_id": upload_id}
