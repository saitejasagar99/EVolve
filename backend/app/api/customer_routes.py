"""
Customer EV Battery Intelligence API Routes.

Implements the user-friendly customer workflow:
  1. POST /api/customer/battery-input -> Prepare & estimate features
  2. POST /api/customer/analyze/{battery_id} -> Run ML models, risk, second-life & recommendation
  3. GET  /api/customer/battery/{battery_id}/report -> View report
  4. GET  /api/customer/assessments -> List past customer assessments
  5. GET  /api/customer/battery/{battery_id}/history -> History timeline
  6. POST /api/customer/collection-request -> Connect to Recycler collection workflow
  7. POST /api/customer/second-life-request -> Connect to Second-Life Consumer marketplace
  8. GET  /api/customer/demo-vehicles -> Pre-configured demo EVs
  9. GET  /api/consumer/second-life-marketplace -> Marketplace for second-life buyers
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import config
from ..database.base import get_db
from ..database.models import (
    Battery,
    BatteryDisposalReport,
    BatteryEnquiry,
    CollectionTask,
    CustomerAssessment,
    Fleet,
    LifecycleEvent,
    ManufacturerSupport,
    User,
    UserVehicle,
    Vehicle,
)
from ..services.auth import get_current_user, get_optional_current_user, require_role
from ..ml.trainer import FEATURE_COLUMNS, ModelBundle
from ..schemas.models import (
    BatteryCollectionByIdPayload,
    CustomerBatteryInputRequest,
    CustomerCollectionRequest,
    CustomerSecondLifeRequest,
)
from ..services import (
    battery_feature_estimator as estimator,
    collection as collection_mod,
    fleet as fleet_mod,
    genai,
    manufacturer_support,
    prevention as prevention_mod,
)

logger = logging.getLogger("evolve.customer")

router = APIRouter(prefix="/api/customer", tags=["Customer Battery Intelligence"])

consumer_router = APIRouter(prefix="/api/consumer", tags=["Consumer Marketplace"])

manufacturer_router = APIRouter(prefix="/api/manufacturers", tags=["Manufacturer Support Directory"])

# In-memory draft store for multi-step wizard state
_DRAFTS: dict[str, dict[str, Any]] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SharingConsentRequest(BaseModel):
    consent: bool = Field(..., description="Consent to share anonymized battery record in Battery Recycling & Recovery portal")


class CustomerBatteryRegisterRequest(BaseModel):
    vehicle_manufacturer: str = Field(default="Tata")
    vehicle_model: str = Field(default="Nexon EV")
    purchase_year: int = Field(default=2024)
    odometer_km: float = Field(default=0.0)
    chemistry: str | None = Field(default="LFP")
    rated_capacity_kwh: float | None = Field(default=40.5)
    reported_condition: str | None = Field(default="NORMAL")
    city: str | None = Field(default="Hyderabad")
    state: str | None = Field(default="Telangana")


class CustomerBatteryUpdateRequest(BaseModel):
    odometer_km: float | None = None
    reported_condition: str | None = None
    city: str | None = None
    state: str | None = None


class CustomerReportEolRequest(BaseModel):
    reporting_reason: str = Field(..., description="Reason for reporting battery for EOL assessment")
    current_condition: str = Field(default="Working", description="Working / Reduced performance / Damaged / Unknown")
    professionally_assessed: bool = Field(default=False, description="Whether battery was professionally removed or assessed")
    assessment_notes: str | None = Field(default=None, description="Notes from professional assessment if applicable")
    collection_city: str = Field(..., description="City for collection logistics")
    collection_state: str = Field(..., description="State for collection logistics")
    collection_pincode: str | None = Field(default=None, description="Optional pincode for logistics")
    sharing_consent: bool = Field(default=True, description="Consent to share technical condition")
    supporting_details: str | None = Field(default=None, description="Optional supporting details or symptoms")


def _get_or_create_retail_fleet(db: Session, zone: str = "South", city: str = "Hyderabad") -> Fleet:
    """Ensure an individual EV owners fleet exists in the database for cross-role analytics."""
    fleet = db.query(Fleet).filter(Fleet.fleet_id == "FLEET-RETAIL-01").first()
    if not fleet:
        fleet = Fleet(
            fleet_id="FLEET-RETAIL-01",
            name="Individual EV Owners Network",
            operator_name="Individual Consumers",
            zone=zone,
            city=city,
            priority="Standard",
            created_at=_utcnow(),
        )
        db.add(fleet)
        db.flush()
    return fleet


def get_or_create_customer_battery(
    db: Session,
    user: User,
    input_data: dict[str, Any] | None = None,
) -> Battery:
    """
    Ensure every authenticated EV Owner has exactly one canonical Battery record.
    Reuses existing battery records rather than creating duplicates.
    """
    # 1. Direct user_id link
    bat = db.query(Battery).filter(Battery.user_id == user.id).first()
    if bat:
        return bat

    # 2. Check if user has an existing CustomerAssessment with a battery_id
    ass = (
        db.query(CustomerAssessment)
        .filter(CustomerAssessment.user_id == user.id)
        .order_by(CustomerAssessment.created_at.desc())
        .first()
    )
    if ass and ass.battery_id:
        bat = db.query(Battery).filter(Battery.id == ass.battery_id).first()
        if bat:
            bat.user_id = user.id
            db.flush()
            return bat

    # 3. Create canonical battery from user registered vehicle or input_data
    uveh = db.query(UserVehicle).filter(UserVehicle.user_id == user.id).first()
    brand = (
        (input_data or {}).get("vehicle_brand")
        or (uveh.manufacturer if uveh else None)
        or "Tata"
    )
    model = (
        (input_data or {}).get("vehicle_model")
        or (uveh.model if uveh else None)
        or "Nexon EV"
    )
    year = int(
        (input_data or {}).get("purchase_year")
        or (uveh.purchase_year if uveh else 2024)
    )
    odo = float(
        (input_data or {}).get("odometer_km")
        or (uveh.odometer_km if uveh else 0.0)
    )
    city = (
        (input_data or {}).get("city")
        or (uveh.city if uveh else None)
        or user.city
        or "Hyderabad"
    )
    state = (
        (input_data or {}).get("state")
        or (uveh.state if uveh else None)
        or user.state
        or "Telangana"
    )

    retail_fleet = _get_or_create_retail_fleet(db, zone=state, city=city)
    stable_suffix = f"{user.id:04d}"
    veh_id_str = f"VEH-EV-{stable_suffix}"
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == veh_id_str).first()
    if not vehicle:
        vehicle = Vehicle(
            vehicle_id=veh_id_str,
            model_name=f"{brand} {model}",
            fleet_id=retail_fleet.id,
            zone=state,
            latitude=17.3850,
            longitude=78.4867,
            in_service_since=_utcnow(),
            annual_distance_km=float(odo / max(1, 2026 - year)),
            distance_travelled_km=odo,
            priority="Standard",
            created_at=_utcnow(),
        )
        db.add(vehicle)
        db.flush()

    battery_id = f"BAT-EV-{stable_suffix}"
    battery_uid = f"BLID-EV-{stable_suffix}"
    bat = Battery(
        battery_uid=battery_uid,
        battery_id=battery_id,
        vehicle_id=vehicle.id,
        user_id=user.id,
        vehicle_manufacturer=brand,
        vehicle_model=model,
        purchase_year=year,
        odometer_km=odo,
        city=city,
        state=state,
        chemistry="LFP",
        rated_capacity_kwh=40.5,
        manufactured_on=_utcnow(),
        installed_on=_utcnow(),
        warranty_years=8,
        current_soh=0.0,
        soc_pct=0.0,
        voltage_v=0.0,
        current_a=0.0,
        temperature_c=25.0,
        peak_temperature_c=25.0,
        charging_cycles=0,
        charging_events=0,
        fast_charge_ratio=0.0,
        energy_delivered_kwh=0.0,
        dc_resistance_mohm=0.0,
        cell_voltage_spread_mv=0.0,
        measured_capacity_fade_pct=0.0,
        lifecycle_status="PENDING_ASSESSMENT",
        collection_status="NOT_REQUIRED",
        second_life_status="NOT_ASSESSED",
        second_life_suitability="NOT_ASSESSED",
        future_risk=None,
        estimated_remaining_years=None,
        recycling_status="NOT_SENT",
        sharing_status="PRIVATE",
        sharing_consent=False,
        data_source="CUSTOMER",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(bat)
    db.flush()

    # Initial append-only lifecycle event
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="BATTERY_RECORD_CREATED",
            location=f"{city}, {state}",
            handler="EVolve AI Customer Registry",
            status="PRIVATE",
            evidence_ref=battery_id,
            actor="customer",
        )
    )
    db.flush()
    return bat


def _serialize_customer_battery(bat: Battery, db: Session | None = None) -> dict[str, Any]:
    # Check whether the customer has completed an assessment or battery was professionally assessed
    has_assessment = False
    if bat.is_professionally_assessed:
        has_assessment = True
    elif bat.second_life_suitability and bat.second_life_suitability not in ["NOT_ASSESSED", "Not assessed"]:
        has_assessment = True
    elif bat.lifecycle_status in ["SECOND_LIFE_CANDIDATE", "EOL_CANDIDATE", "COLLECTION_REQUESTED", "COLLECTED", "PROCESSING", "RECOVERY_COMPLETED"]:
        has_assessment = True
    elif db is not None:
        has_assessment = (
            db.query(CustomerAssessment)
            .filter(CustomerAssessment.battery_id == bat.id)
            .first()
            is not None
        )
    elif hasattr(bat, "assessments") and bat.assessments:
        has_assessment = len(bat.assessments) > 0
    elif bat.data_source in ["CUSTOMER_ASSESSED", "CUSTOMER_DEMO", "PROFESSIONALLY_ASSESSED"]:
        has_assessment = True

    if has_assessment and bat.current_soh and bat.current_soh > 0.0:
        soh_pct = round(bat.current_soh * 100.0, 1)
        cycles = bat.charging_cycles or 0
        risk = bat.future_risk or "Low"
        rem_years = bat.estimated_remaining_years or 5.0
        health_band = "Good"
        if soh_pct >= 80.0:
            health_band = "Good"
        elif soh_pct >= 70.0:
            health_band = "Fair"
        elif soh_pct >= 55.0:
            health_band = "Needs Attention"
        else:
            health_band = "Critical"
    else:
        # Before entering details / running assessment: no fake SOH or cycles
        soh_pct = None
        cycles = 0
        risk = None
        rem_years = None
        health_band = "Not Assessed"

    # Assess suitability flags
    is_second_life_appropriate = (
        has_assessment and soh_pct is not None and 55.0 <= soh_pct < 80.0
    )
    is_recycling_recommended = (
        has_assessment
        and (
            (soh_pct is not None and soh_pct < 55.0)
            or bat.lifecycle_status == "EOL_CANDIDATE"
        )
    )

    return {
        "id": bat.id,
        "battery_id": bat.battery_id,
        "battery_uid": bat.battery_uid,
        "user_id": bat.user_id,
        "vehicle_manufacturer": bat.vehicle_manufacturer or "Tata",
        "vehicle_model": bat.vehicle_model or (bat.vehicle.model_name if bat.vehicle else "Nexon EV"),
        "purchase_year": bat.purchase_year or 2024,
        "odometer_km": bat.odometer_km or 0.0,
        "chemistry": bat.chemistry or "LFP",
        "rated_capacity_kwh": bat.rated_capacity_kwh or 40.5,
        "current_soh": bat.current_soh if has_assessment else None,
        "soh_pct": soh_pct,
        "health_band": health_band,
        "charging_cycles": cycles,
        "future_risk": risk,
        "estimated_remaining_years": rem_years,
        "second_life_suitability": bat.second_life_suitability if has_assessment else "NOT_ASSESSED",
        "second_life_status": bat.second_life_status,
        "recycling_status": bat.recycling_status,
        "collection_status": bat.collection_status,
        "lifecycle_status": bat.lifecycle_status if has_assessment else "PENDING_ASSESSMENT",
        "sharing_status": bat.sharing_status,
        "sharing_consent": bat.sharing_consent,
        "reported_condition": bat.reported_condition or "NORMAL",
        "city": bat.city or "Hyderabad",
        "state": bat.state or "Telangana",
        "needs_assessment": not has_assessment,
        "is_assessed": has_assessment,
        "is_second_life_appropriate": is_second_life_appropriate,
        "is_recycling_recommended": is_recycling_recommended,
        "eol_reported_at": bat.eol_reported_at.isoformat() if bat.eol_reported_at else None,
        "eol_reason": bat.eol_reason,
        "is_professionally_assessed": bat.is_professionally_assessed,
        "enquiries_count": len(bat.enquiries) if bat.enquiries else 0,
        "created_at": bat.created_at.isoformat() if bat.created_at else None,
        "updated_at": bat.updated_at.isoformat() if bat.updated_at else None,
    }


# ---------------------------------------------------------------------------
# 1. Prepare Battery Analysis (Feature Derivation & Summary)
# ---------------------------------------------------------------------------

@router.post("/battery-input")
def prepare_battery_input(payload: CustomerBatteryInputRequest) -> dict[str, Any]:
    """
    Receives simple user inputs, derives technical parameters, calculates
    data confidence, and returns summary indicators for the preparation screen.
    """
    try:
        input_dict = payload.model_dump()
        draft_id = f"DRAFT-{uuid.uuid4().hex[:8].upper()}"

        # 1. Feature estimation & provenance tracking
        est_result = estimator.estimate_battery_features(input_dict)
        features = est_result["features"]
        provenance = est_result["provenance"]

        # 2. Honest data confidence score
        confidence = estimator.calculate_analysis_confidence(input_dict)

        # 3. High-level summary indicators
        summary = estimator.derive_summary_indicators(input_dict, features)

        # 4. Preliminary Economic Cost Estimation
        prelim_soh = max(45.0, min(98.0, 100.0 - float(features.get("measured_capacity_fade_pct", 18.0))))
        cost_est = estimator.estimate_battery_costs(
            capacity_kwh=features.get("rated_capacity_kwh", 40.0),
            chemistry=features.get("chemistry", "LFP"),
            soh_pct=prelim_soh,
            vehicle_model=payload.vehicle_model,
            pathway="SECOND_LIFE_ASSESSMENT" if prelim_soh < 75.0 else "CONTINUE_USE",
        )

        # 5. Manufacturer Support & Replacement Verification Advisory
        has_crit = str(payload.warning_condition or "").lower() in ("critical", "overheating", "thermal", "severe")
        mfg_advisory = manufacturer_support.build_manufacturer_advisory(
            brand=payload.vehicle_brand,
            country_code="IN",
            model=payload.vehicle_model,
            is_diagnostic_confirmed=False,
            has_critical_warning=has_crit,
            db=None,
        )

        _DRAFTS[draft_id] = {
            "input": input_dict,
            "features": features,
            "provenance": provenance,
            "confidence": confidence,
            "summary": summary,
            "cost_estimation": cost_est,
            "manufacturer_support": mfg_advisory,
            "created_at": _utcnow().isoformat(),
        }

        return {
            "draft_id": draft_id,
            "vehicle": {
                "brand": payload.vehicle_brand,
                "model": payload.vehicle_model,
                "purchase_year": payload.purchase_year,
                "odometer_km": features.get("odometer_km"),
                "city": payload.city,
                "state": payload.state,
            },
            "summary": summary,
            "confidence": confidence,
            "cost_estimation": cost_est,
            "manufacturer_support": mfg_advisory,
            "technical_details": {
                "features": features,
                "provenance": provenance,
            },
            "is_demo": payload.is_demo,
        }
    except Exception as exc:
        logger.exception("Error in prepare_battery_input: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="We need a little more information to prepare your battery analysis. Please review your answers.",
        ) from exc


# ---------------------------------------------------------------------------
# 2. Run Full Analysis (Derived Features -> ML Models -> Decision -> Report)
# ---------------------------------------------------------------------------

@router.post("/analyze/{battery_id}")
def analyze_customer_battery(
    battery_id: str,
    payload: CustomerBatteryInputRequest | None = None,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Performs full battery intelligence analysis:
      1. Recovers or derives technical features from simple inputs.
      2. Executes trained ML models (SOH regressor, EOL horizon, IsolationForest anomaly).
      3. Evaluates circularity pathway (Continue Use, Repair, Second-Life, EOL Recycling).
      4. Persists the assessment and creates/updates Battery row for cross-role data flow.
      5. Returns friendly customer report.
    """
    try:
        # Check if battery_id is a known draft_id or if payload was passed
        input_data: dict[str, Any]
        if payload is not None:
            input_data = payload.model_dump()
        elif battery_id in _DRAFTS:
            input_data = _DRAFTS[battery_id]["input"]
        else:
            # Check if this corresponds to an existing assessment to re-run
            existing_ass = db.query(CustomerAssessment).filter(
                (CustomerAssessment.assessment_id == battery_id)
                | (CustomerAssessment.battery_uid == battery_id)
            ).first()
            if existing_ass:
                input_data = {
                    "vehicle_brand": existing_ass.vehicle_brand,
                    "vehicle_model": existing_ass.vehicle_model,
                    "purchase_year": existing_ass.purchase_year,
                    "odometer_km": existing_ass.odometer_km,
                    "daily_driving": existing_ass.daily_driving,
                    "charging_frequency": existing_ass.charging_frequency,
                    "charging_method": existing_ass.charging_method,
                    "driving_pattern": existing_ass.driving_pattern,
                    "range_condition": existing_ass.range_condition,
                    "charging_condition": existing_ass.charging_condition,
                    "temperature_condition": existing_ass.temperature_condition,
                    "warning_condition": existing_ass.warning_condition,
                    "range_fluctuation": existing_ass.range_fluctuation,
                    "city": existing_ass.city,
                    "state": existing_ass.state,
                    "pincode": existing_ass.pincode,
                    "battery_capacity_kwh": existing_ass.battery_capacity_kwh,
                    "battery_chemistry": existing_ass.battery_chemistry,
                    "soh_input": existing_ass.soh_input,
                    "is_demo": existing_ass.is_demo,
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Battery analysis draft or record not found. Please provide vehicle details.",
                )

        # 1. Feature estimation & confidence
        est_res = estimator.estimate_battery_features(input_data)
        features = est_res["features"]
        provenance = est_res["provenance"]
        confidence = estimator.calculate_analysis_confidence(input_data)
        summary = estimator.derive_summary_indicators(input_data, features)

        # 2. Run existing ML models
        bundle = ModelBundle()
        if not bundle.ready:
            from ..ml.trainer import train_all
            logger.info("Training ML models on demand for customer analysis...")
            train_all(verbose=False)
            bundle = ModelBundle()

        feature_row = {k: features[k] for k in FEATURE_COLUMNS}
        df_in = pd.DataFrame([feature_row])
        preds = bundle.predict(df_in)

        soh_pred = float(preds["soh"][0])
        soh_pct = round(soh_pred * 100.0, 1)
        eol_months = float(preds["eol"][0])
        eol_years = round(max(0.0, eol_months / 12.0), 1)
        anomaly_score = float(preds["anomaly"][0])

        # 3. Determine health band & future risk
        if soh_pct >= 80.0:
            health_band = "Good"
            health_tone = "green"
            health_dot = "bg-emerald-500"
        elif soh_pct >= 70.0:
            health_band = "Fair"
            health_tone = "yellow"
            health_dot = "bg-amber-500"
        elif soh_pct >= 55.0:
            health_band = "Needs Attention"
            health_tone = "orange"
            health_dot = "bg-orange-500"
        else:
            health_band = "Critical"
            health_tone = "red"
            health_dot = "bg-rose-500"

        if anomaly_score >= 0.55 or eol_months <= 6.0:
            future_risk = "High"
        elif eol_months <= 24.0 or soh_pct < 72.0 or anomaly_score >= 0.35:
            future_risk = "Medium"
        else:
            future_risk = "Low"

        # 4. Run existing prevention pathway engine
        battery_record_for_prevention = {
            "battery_id": battery_id,
            "vehicle_id": f"VEH-{battery_id}",
            "zone": input_data.get("state") or "South",
            "soh_pct": soh_pct,
            "battery_age_months": features["months_in_service"],
            "charging_cycles": int(features["equivalent_full_cycles"]),
            "anomaly_score": anomaly_score,
            "eol_in_months": eol_months,
            "data_confidence": confidence["confidence_pct"],
            "temperature": {"history_max_c": features["peak_cell_temp_c"]},
        }
        pathway_result = prevention_mod.decide_pathway(battery_record_for_prevention)
        pathway_code = pathway_result["pathway"]
        rules_fired = pathway_result.get("rules_fired", [])

        # 5. Second-Life Potential
        if 55.0 <= soh_pct < 75.0:
            second_life_potential = "High"
            second_life_desc = "Your battery may no longer be ideal for an EV, but has high useful capacity for stationary energy storage or home backup."
        elif 75.0 <= soh_pct < 85.0:
            second_life_potential = "Medium"
            second_life_desc = "Your battery has plenty of active vehicle life remaining before second-life conversion is needed."
        elif soh_pct < 55.0:
            second_life_potential = "Low"
            second_life_desc = "Cell degradation has exceeded second-life storage thresholds; direct recycling is recommended."
        else:
            second_life_potential = "N/A"
            second_life_desc = "Battery is in excellent vehicle health with extensive traction lifespan remaining."

        # 6. Action card content ("What Should I Do?")
        if pathway_code == "CONTINUE_USE":
            rec_action = "CONTINUE_USE"
            rec_title = "Continue using your EV"
            rec_summary = "Your battery is currently in good condition."
            rec_actions = [
                "Continue normal daily usage and driving habits",
                "Monitor battery range periodically across seasons",
                "Avoid unnecessary extreme fast charging when AC home charging is available",
                "Recheck battery health periodically (every 6 months)",
            ]
        elif pathway_code == "REPAIR_REFURBISHMENT":
            rec_action = "REPAIR_REFURBISHMENT"
            rec_title = "Consider a Battery Health Inspection"
            rec_summary = "Your battery is showing recoverable degradation or cell imbalance that can be resolved before further wear."
            rec_actions = [
                "Schedule a certified service center inspection",
                "Request a BMS cell-balancing calibration cycle",
                "Limit deep discharges below 15% state-of-charge",
                "Re-evaluate health after service balancing",
            ]
        elif pathway_code == "SECOND_LIFE_ASSESSMENT":
            rec_action = "SECOND_LIFE_ASSESSMENT"
            rec_title = "Consider a Second-Life Assessment"
            rec_summary = "Your battery may be approaching the end of its optimal EV usage period but still holds valuable capacity for stationary energy storage."
            rec_actions = [
                "Explore certified second-life marketplace options",
                "Request a stationary storage fitness evaluation",
                "Monetize battery residual value before full degradation",
                "Avoid aggressive acceleration or extreme highway loads",
            ]
        else:  # EOL_CANDIDATE
            rec_action = "EOL_CANDIDATE"
            rec_title = "Your Battery May Need Collection"
            rec_summary = "Our analysis suggests your battery is approaching the end of its useful EV life and should be scheduled for safe recovery and recycling."
            rec_actions = [
                "Request battery collection from certified recyclers",
                "Avoid operating on severely degraded or thermally stressed cells",
                "Retain end-of-life documentation for circular compliance",
            ]

        # 7. Why explanation bullet points
        why_points = estimator.build_why_explanation(
            input_data, features, soh_pct, future_risk, pathway_code
        )

        # 8. Optional AI explanation via GenAI service (with deterministic fallback)
        ai_explanation = None
        try:
            facts = {
                "vehicle": f"{input_data.get('vehicle_brand')} {input_data.get('vehicle_model')}",
                "age_years": round(features["months_in_service"] / 12.0, 1),
                "odometer_km": int(features["odometer_km"]),
                "soh_pct": soh_pct,
                "health_status": health_band,
                "future_risk": future_risk,
                "remaining_years": eol_years,
                "second_life_potential": second_life_potential,
                "recommended_action": rec_title,
                "pathway": pathway_code,
            }
            exp_res = genai.explain_facts(facts, allow_external=True)
            ai_explanation = exp_res.get("explanation")
        except Exception as exc:
            logger.info("AI explanation fallback used: %s", exc)
            ai_explanation = None

        # 9. Cross-role database persistence
        if current_user:
            battery = get_or_create_customer_battery(db, current_user, input_data)
            vehicle = battery.vehicle
            battery.current_soh = soh_pred
            battery.chemistry = features.get("chemistry", "LFP")
            battery.rated_capacity_kwh = features.get("rated_capacity_kwh", 40.0)
            battery.voltage_v = float(input_data.get("voltage_input") or 350.0)
            battery.current_a = float(input_data.get("current_input") or 25.0)
            battery.temperature_c = features["avg_cell_temp_c"]
            battery.peak_temperature_c = features["peak_cell_temp_c"]
            battery.charging_cycles = int(features["equivalent_full_cycles"])
            battery.charging_events = int(features["equivalent_full_cycles"] * 1.8)
            battery.fast_charge_ratio = features["fast_charge_ratio"]
            battery.energy_delivered_kwh = features["energy_throughput_kwh"]
            battery.dc_resistance_mohm = features["dc_resistance_mohm"]
            battery.cell_voltage_spread_mv = features["cell_voltage_spread_mv"]
            battery.measured_capacity_fade_pct = features["measured_capacity_fade_pct"]
            battery.history_months = int(features["months_in_service"])
            battery.odometer_km = float(features["odometer_km"])
            battery.reported_condition = str(input_data.get("range_condition", "NORMAL"))
            battery.second_life_suitability = second_life_potential
            battery.future_risk = future_risk
            battery.estimated_remaining_years = eol_years
            battery.city = str(input_data.get("city", battery.city or "Hyderabad"))
            battery.state = str(input_data.get("state", battery.state or "Telangana"))
            battery.updated_at = _utcnow()

            # Lifecycle status
            lifecycle_status = "IN_SERVICE"
            if pathway_code == "EOL_CANDIDATE":
                lifecycle_status = "EOL_CANDIDATE"
                battery.collection_status = "REQUIRED"
                if battery.sharing_consent:
                    battery.sharing_status = "APPROVED_FOR_RECYCLING"
            elif pathway_code == "SECOND_LIFE_ASSESSMENT":
                lifecycle_status = "SECOND_LIFE_CANDIDATE"
                battery.second_life_status = "CANDIDATE"
                if battery.sharing_consent:
                    battery.sharing_status = "APPROVED_FOR_SECOND_LIFE"
            else:
                lifecycle_status = "IN_SERVICE"
                if battery.sharing_consent and battery.sharing_status == "PRIVATE":
                    battery.sharing_status = "PENDING_ASSESSMENT"

            battery.lifecycle_status = lifecycle_status
            assessment_id = f"CUST-{battery.battery_id}-{uuid.uuid4().hex[:6].upper()}"
            battery_uid = battery.battery_uid
        else:
            assessment_id = f"CUST-BAT-{uuid.uuid4().hex[:6].upper()}"
            battery_uid = f"BLID-CUST-{uuid.uuid4().hex[:6].upper()}"

            retail_fleet = _get_or_create_retail_fleet(
                db, zone=input_data.get("state") or "South", city=input_data.get("city") or "Hyderabad"
            )

            # Create or update Vehicle
            veh_id_str = f"VEH-{assessment_id}"
            model_full = f"{input_data.get('vehicle_brand')} {input_data.get('vehicle_model')}"
            vehicle = Vehicle(
                vehicle_id=veh_id_str,
                model_name=model_full,
                fleet_id=retail_fleet.id,
                zone=retail_fleet.zone,
                latitude=17.3850,
                longitude=78.4867,
                in_service_since=_utcnow(),
                annual_distance_km=float(features["daily_km"] * 365),
                distance_travelled_km=float(features["odometer_km"]),
                priority="Standard",
                created_at=_utcnow(),
            )
            db.add(vehicle)
            db.flush()

            # Create Battery row in database (so Fleet, Collection, Marketplace, Admin see it!)
            lifecycle_status = "IN_SERVICE"
            if pathway_code == "EOL_CANDIDATE":
                lifecycle_status = "EOL_CANDIDATE"
            elif pathway_code == "SECOND_LIFE_ASSESSMENT":
                lifecycle_status = "SECOND_LIFE_CANDIDATE"

            second_life_status = "CANDIDATE" if pathway_code == "SECOND_LIFE_ASSESSMENT" else "NOT_ASSESSED"
            collection_status = "REQUIRED" if pathway_code == "EOL_CANDIDATE" else "NOT_REQUIRED"

            battery = Battery(
                battery_uid=battery_uid,
                battery_id=f"BAT-{assessment_id}",
                vehicle_id=vehicle.id,
                chemistry=features.get("chemistry", "LFP"),
                rated_capacity_kwh=features.get("rated_capacity_kwh", 40.0),
                manufactured_on=_utcnow(),
                installed_on=_utcnow(),
                warranty_years=8,
                current_soh=soh_pred,
                soc_pct=85.0,
                voltage_v=float(input_data.get("voltage_input") or 350.0),
                current_a=float(input_data.get("current_input") or 25.0),
                temperature_c=features["avg_cell_temp_c"],
                peak_temperature_c=features["peak_cell_temp_c"],
                charging_cycles=int(features["equivalent_full_cycles"]),
                charging_events=int(features["equivalent_full_cycles"] * 1.8),
                fast_charge_ratio=features["fast_charge_ratio"],
                energy_delivered_kwh=features["energy_throughput_kwh"],
                dc_resistance_mohm=features["dc_resistance_mohm"],
                cell_voltage_spread_mv=features["cell_voltage_spread_mv"],
                measured_capacity_fade_pct=features["measured_capacity_fade_pct"],
                reading_count=1,
                history_months=int(features["months_in_service"]),
                lifecycle_status=lifecycle_status,
                collection_status=collection_status,
                second_life_status=second_life_status,
                recycling_status="NOT_SENT",
                sharing_status="PRIVATE",
                sharing_consent=False,
                data_source="CUSTOMER_DEMO" if input_data.get("is_demo") else "CUSTOMER",
                created_at=_utcnow(),
                updated_at=_utcnow(),
            )
            db.add(battery)
            db.flush()

        # If EOL candidate, automatically create CollectionTask so recycler sees it!
        if pathway_code == "EOL_CANDIDATE":
            col_task = CollectionTask(
                battery_id=battery.id,
                priority_score=0.88,
                priority_band="CRITICAL",
                status="PENDING",
                factors=json.dumps({"reason": "Customer assessment flagged EOL", "soh": soh_pct}),
            )
            db.add(col_task)

        # Append to audit trail
        event_note = f"Customer assessment completed: Health {soh_pct}%, Pathway {pathway_code}"
        db.add(
            LifecycleEvent(
                battery_id=battery.id,
                occurred_at=_utcnow(),
                event="CUSTOMER_ASSESSMENT_COMPLETED",
                location=f"{input_data.get('city')}, {input_data.get('state')}",
                handler="EVolve AI Customer Intelligence",
                status="RECORDED",
                evidence_ref=assessment_id,
                actor="customer",
            )
        )

        # Save assessment record (upsert to guarantee no unique constraint collisions)
        customer_record = (
            db.query(CustomerAssessment)
            .filter(CustomerAssessment.assessment_id == assessment_id)
            .first()
        )

        if customer_record:
            customer_record.battery_id = battery.id
            customer_record.battery_uid = battery_uid
            customer_record.user_id = current_user.id if current_user else None
            customer_record.created_at = _utcnow()
            customer_record.vehicle_brand = input_data.get("vehicle_brand", "Tata")
            customer_record.vehicle_model = input_data.get("vehicle_model", "Nexon EV")
            customer_record.purchase_year = int(input_data.get("purchase_year", 2023))
            customer_record.odometer_km = float(features["odometer_km"])
            customer_record.daily_driving = str(input_data.get("daily_driving", "20_50"))
            customer_record.charging_frequency = str(input_data.get("charging_frequency", "3_5_week"))
            customer_record.charging_method = str(input_data.get("charging_method", "home"))
            customer_record.driving_pattern = str(input_data.get("driving_pattern", "city"))
            customer_record.range_condition = str(input_data.get("range_condition", "same"))
            customer_record.charging_condition = str(input_data.get("charging_condition", "normal"))
            customer_record.temperature_condition = str(input_data.get("temperature_condition", "normal"))
            customer_record.warning_condition = str(input_data.get("warning_condition", "none"))
            customer_record.range_fluctuation = str(input_data.get("range_fluctuation", "never"))
            customer_record.city = str(input_data.get("city", "Hyderabad"))
            customer_record.state = str(input_data.get("state", "Telangana"))
            customer_record.pincode = input_data.get("pincode")
            customer_record.battery_capacity_kwh = features.get("rated_capacity_kwh")
            customer_record.battery_chemistry = features.get("chemistry")
            customer_record.soh_input = input_data.get("soh_input")
            customer_record.cycle_count_input = input_data.get("cycle_count_input")
            customer_record.voltage_input = input_data.get("voltage_input")
            customer_record.current_input = input_data.get("current_input")
            customer_record.temperature_input = input_data.get("temperature_input")
            customer_record.internal_resistance_mohm = input_data.get("internal_resistance_mohm")
            customer_record.dod_input = input_data.get("dod_input")
            customer_record.confidence_score = confidence["confidence_pct"]
            customer_record.confidence_band = confidence["confidence_band"]
            customer_record.soh_predicted = soh_pred
            customer_record.soh_health_band = health_band
            customer_record.future_risk = future_risk
            customer_record.estimated_remaining_years = eol_years
            customer_record.second_life_potential = second_life_potential
            customer_record.recommended_action = rec_action
            customer_record.recommendation_title = rec_title
            customer_record.recommendation_message = rec_summary
            customer_record.feature_provenance = json.dumps(provenance)
            customer_record.derived_features = json.dumps(features)
            customer_record.why_explanation = json.dumps(why_points)
            customer_record.ai_explanation = ai_explanation
            customer_record.is_demo = bool(input_data.get("is_demo", False))
        else:
            customer_record = CustomerAssessment(
                assessment_id=assessment_id,
                battery_id=battery.id,
                battery_uid=battery_uid,
                user_id=current_user.id if current_user else None,
                created_at=_utcnow(),
                vehicle_brand=input_data.get("vehicle_brand", "Tata"),
                vehicle_model=input_data.get("vehicle_model", "Nexon EV"),
                purchase_year=int(input_data.get("purchase_year", 2023)),
                odometer_km=float(features["odometer_km"]),
                daily_driving=str(input_data.get("daily_driving", "20_50")),
                charging_frequency=str(input_data.get("charging_frequency", "3_5_week")),
                charging_method=str(input_data.get("charging_method", "home")),
                driving_pattern=str(input_data.get("driving_pattern", "city")),
                range_condition=str(input_data.get("range_condition", "same")),
                charging_condition=str(input_data.get("charging_condition", "normal")),
                temperature_condition=str(input_data.get("temperature_condition", "normal")),
                warning_condition=str(input_data.get("warning_condition", "none")),
                range_fluctuation=str(input_data.get("range_fluctuation", "never")),
                city=str(input_data.get("city", "Hyderabad")),
                state=str(input_data.get("state", "Telangana")),
                pincode=input_data.get("pincode"),
                battery_capacity_kwh=features.get("rated_capacity_kwh"),
                battery_chemistry=features.get("chemistry"),
                soh_input=input_data.get("soh_input"),
                cycle_count_input=input_data.get("cycle_count_input"),
                voltage_input=input_data.get("voltage_input"),
                current_input=input_data.get("current_input"),
                temperature_input=input_data.get("temperature_input"),
                internal_resistance_mohm=input_data.get("internal_resistance_mohm"),
                dod_input=input_data.get("dod_input"),
                confidence_score=confidence["confidence_pct"],
                confidence_band=confidence["confidence_band"],
                soh_predicted=soh_pred,
                soh_health_band=health_band,
                future_risk=future_risk,
                estimated_remaining_years=eol_years,
                second_life_potential=second_life_potential,
                recommended_action=rec_action,
                recommendation_title=rec_title,
                recommendation_message=rec_summary,
                feature_provenance=json.dumps(provenance),
                derived_features=json.dumps(features),
                why_explanation=json.dumps(why_points),
                ai_explanation=ai_explanation,
                is_demo=bool(input_data.get("is_demo", False)),
            )
            db.add(customer_record)
        db.commit()

        # Invalidate fleet cache so Admin / Fleet views reflect new additions
        fleet_mod.invalidate()

        # Clean up draft if used
        if battery_id in _DRAFTS:
            del _DRAFTS[battery_id]

        report = _format_customer_report(customer_record, battery, vehicle)
        return report

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error analyzing customer battery: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="We couldn't complete the analysis right now. Your information is safe. Please try again.",
        ) from exc


# ---------------------------------------------------------------------------
# 3. Get Full Customer Battery Report
# ---------------------------------------------------------------------------

@router.get("/battery/{battery_id}/report")
def get_customer_report(battery_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Retrieve full customer battery report by assessment ID or battery ID."""
    ass = db.query(CustomerAssessment).filter(
        (CustomerAssessment.assessment_id == battery_id)
        | (CustomerAssessment.battery_uid == battery_id)
        | (CustomerAssessment.id == (int(battery_id) if battery_id.isdigit() else -1))
    ).order_by(CustomerAssessment.created_at.desc()).first()

    if not ass:
        # Check if battery exists in standard battery table
        bat = db.query(Battery).filter(
            (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
        ).first()
        if not bat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Battery report not found.",
            )
        # Check if there is an existing customer assessment record for this battery
        ass = (
            db.query(CustomerAssessment)
            .filter(CustomerAssessment.battery_id == bat.id)
            .order_by(CustomerAssessment.created_at.desc())
            .first()
        )
        if ass:
            veh = db.query(Vehicle).filter(Vehicle.id == bat.vehicle_id).first() if bat else None
            return _format_customer_report(ass, bat, veh)
        # Synthesize assessment from Battery record
        return _synthesize_report_from_battery(bat, db)

    bat = db.query(Battery).filter(Battery.id == ass.battery_id).first() if ass.battery_id else None
    veh = db.query(Vehicle).filter(Vehicle.id == bat.vehicle_id).first() if bat else None
    return _format_customer_report(ass, bat, veh)


# ---------------------------------------------------------------------------
# 4. List Past Customer Assessments (History & Dashboard)
# ---------------------------------------------------------------------------

@router.get("/assessments")
def list_customer_assessments(
    limit: int = 20,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """List recent customer assessments for the customer dashboard."""
    query = db.query(CustomerAssessment)
    if current_user:
        user_rows = (
            query.filter(CustomerAssessment.user_id == current_user.id)
            .order_by(CustomerAssessment.created_at.desc())
            .limit(limit)
            .all()
        )
        if user_rows:
            rows = user_rows
        else:
            rows = query.order_by(CustomerAssessment.created_at.desc()).limit(limit).all()
    else:
        rows = query.order_by(CustomerAssessment.created_at.desc()).limit(limit).all()

    items = []
    for r in rows:
        bat = db.query(Battery).filter(Battery.id == r.battery_id).first() if r.battery_id else None
        bat_id_str = bat.battery_id if bat else (r.battery_uid or f"BAT-{r.assessment_id}")
        items.append({
            "assessment_id": r.assessment_id,
            "battery_id": bat_id_str,
            "created_at": r.created_at.isoformat(),
            "vehicle": f"{r.vehicle_brand} {r.vehicle_model}",
            "purchase_year": r.purchase_year,
            "odometer_km": r.odometer_km,
            "soh_pct": round(r.soh_predicted * 100.0, 1),
            "health_band": r.soh_health_band,
            "future_risk": r.future_risk,
            "estimated_years": r.estimated_remaining_years,
            "second_life_potential": r.second_life_potential,
            "recommended_action": r.recommended_action,
            "recommendation_title": r.recommendation_title,
            "collection_status": r.collection_status,
            "second_life_status": r.second_life_status,
            "is_demo": r.is_demo,
        })

    return {"count": len(items), "assessments": items}


# ---------------------------------------------------------------------------
# 5. Timeline History for a Specific Customer Battery
# ---------------------------------------------------------------------------

@router.get("/battery/{battery_id}/history")
def get_customer_battery_history(battery_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Return chronological event timeline for the customer vehicle."""
    ass = db.query(CustomerAssessment).filter(
        (CustomerAssessment.assessment_id == battery_id)
        | (CustomerAssessment.battery_uid == battery_id)
    ).first()

    timeline = []
    if ass and ass.battery_id:
        events = (
            db.query(LifecycleEvent)
            .filter(LifecycleEvent.battery_id == ass.battery_id)
            .order_by(LifecycleEvent.occurred_at.asc())
            .all()
        )
        for ev in events:
            timeline.append({
                "occurred_at": ev.occurred_at.isoformat(),
                "year": ev.occurred_at.year,
                "event": ev.event,
                "location": ev.location,
                "handler": ev.handler,
                "status": ev.status,
                "actor": ev.actor,
            })

    if not timeline and ass:
        timeline.append({
            "occurred_at": ass.created_at.isoformat(),
            "year": ass.created_at.year,
            "event": "BATTERY_HEALTH_CHECKED",
            "location": f"{ass.city}, {ass.state}",
            "handler": "EVolve AI",
            "status": f"{round(ass.soh_predicted * 100)}% Health · {ass.soh_health_band}",
            "actor": "customer",
        })

    return {
        "battery_id": battery_id,
        "timeline": timeline,
    }


# ---------------------------------------------------------------------------
# Customer Battery Record & Lifecycle Management (Requirements 1, 2, 3, 4, 7)
# ---------------------------------------------------------------------------

@router.get("/batteries")
def get_customer_batteries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List all batteries owned by the authenticated EV Owner.
    If the customer registered with vehicle details but doesn't have a battery row yet,
    initializes their canonical battery record automatically.
    """
    bats = db.query(Battery).filter(Battery.user_id == current_user.id).all()
    if not bats:
        bat = get_or_create_customer_battery(db, current_user)
        db.commit()
        bats = [bat]

    serialized = [_serialize_customer_battery(b, db) for b in bats]
    return {"count": len(serialized), "batteries": serialized}


@router.get("/batteries/{battery_id}")
def get_single_customer_battery(
    battery_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve details for a specific customer battery. Enforces owner authorization."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")

    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    ass = (
        db.query(CustomerAssessment)
        .filter(CustomerAssessment.battery_id == bat.id)
        .order_by(CustomerAssessment.created_at.desc())
        .first()
    )

    events = (
        db.query(LifecycleEvent)
        .filter(LifecycleEvent.battery_id == bat.id)
        .order_by(LifecycleEvent.occurred_at.asc())
        .all()
    )
    timeline = [
        {
            "id": ev.id,
            "occurred_at": ev.occurred_at.isoformat(),
            "year": ev.occurred_at.year,
            "event": ev.event,
            "location": ev.location,
            "handler": ev.handler,
            "status": ev.status,
            "actor": ev.actor,
        }
        for ev in events
    ]

    return {
        "battery": _serialize_customer_battery(bat, db),
        "assessment": {
            "assessment_id": ass.assessment_id,
            "recommendation_title": ass.recommendation_title,
            "recommendation_message": ass.recommendation_message,
            "recommended_action": ass.recommended_action,
            "future_risk": ass.future_risk,
            "second_life_potential": ass.second_life_potential,
        } if ass else None,
        "timeline": timeline,
    }


@router.post("/batteries")
def create_or_register_customer_battery(
    payload: CustomerBatteryRegisterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create or update canonical battery details for the authenticated EV Owner."""
    data = payload.model_dump()
    data["vehicle_brand"] = data["vehicle_manufacturer"]
    bat = get_or_create_customer_battery(db, current_user, data)
    bat.vehicle_manufacturer = payload.vehicle_manufacturer
    bat.vehicle_model = payload.vehicle_model
    bat.purchase_year = payload.purchase_year
    bat.odometer_km = payload.odometer_km
    if payload.chemistry:
        bat.chemistry = payload.chemistry
    if payload.rated_capacity_kwh:
        bat.rated_capacity_kwh = payload.rated_capacity_kwh
    if payload.reported_condition:
        bat.reported_condition = payload.reported_condition
    if payload.city:
        bat.city = payload.city
    if payload.state:
        bat.state = payload.state
    bat.updated_at = _utcnow()
    db.commit()
    fleet_mod.invalidate()
    return {"status": "success", "battery": _serialize_customer_battery(bat, db)}


@router.put("/batteries/{battery_id}")
def update_customer_battery(
    battery_id: str,
    payload: CustomerBatteryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update editable details on customer battery."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    if payload.odometer_km is not None:
        bat.odometer_km = payload.odometer_km
    if payload.reported_condition is not None:
        bat.reported_condition = payload.reported_condition
    if payload.city is not None:
        bat.city = payload.city
    if payload.state is not None:
        bat.state = payload.state
    bat.updated_at = _utcnow()
    db.commit()
    fleet_mod.invalidate()
    return {"status": "success", "battery": _serialize_customer_battery(bat, db)}


@router.post("/batteries/{battery_id}/sharing-consent")
def set_sharing_consent(
    battery_id: str,
    payload: SharingConsentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Grant or withdraw consent to share anonymized battery information."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    bat.sharing_consent = payload.consent
    if payload.consent:
        has_ass = (
            db.query(CustomerAssessment)
            .filter(CustomerAssessment.battery_id == bat.id)
            .first()
            is not None
        )
        if not has_ass or bat.current_soh == 0.0 or bat.lifecycle_status == "PENDING_ASSESSMENT":
            bat.sharing_status = "PENDING_ASSESSMENT"
        elif bat.lifecycle_status == "EOL_CANDIDATE" or (bat.current_soh is not None and 0.0 < bat.current_soh < 0.55):
            bat.sharing_status = "APPROVED_FOR_RECYCLING"
        elif bat.lifecycle_status == "SECOND_LIFE_CANDIDATE" or (bat.current_soh is not None and 0.55 <= bat.current_soh < 0.80):
            bat.sharing_status = "APPROVED_FOR_SECOND_LIFE"
        elif bat.sharing_status == "PRIVATE":
            bat.sharing_status = "PENDING_ASSESSMENT"

        ev_msg = f"Sharing consent granted. Anonymized specifications shared under '{bat.sharing_status}'."
        db.add(
            LifecycleEvent(
                battery_id=bat.id,
                occurred_at=_utcnow(),
                event="SHARING_CONSENT_GRANTED",
                location=f"{bat.city or 'Customer'}, {bat.state or 'India'}",
                handler="Customer Portal",
                status=bat.sharing_status,
                evidence_ref=f"CONSENT-{bat.battery_id}",
                actor="customer",
            )
        )
    else:
        if bat.collection_status not in ["COLLECTED", "DELIVERED_TO_FACILITY"]:
            bat.sharing_status = "PRIVATE"
        ev_msg = "Sharing consent withdrawn. Battery record returned to PRIVATE status."
        db.add(
            LifecycleEvent(
                battery_id=bat.id,
                occurred_at=_utcnow(),
                event="SHARING_CONSENT_WITHDRAWN",
                location=f"{bat.city or 'Customer'}, {bat.state or 'India'}",
                handler="Customer Portal",
                status="PRIVATE",
                evidence_ref=f"REVOKE-{bat.battery_id}",
                actor="customer",
            )
        )

    bat.updated_at = _utcnow()
    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "sharing_status": bat.sharing_status,
        "sharing_consent": bat.sharing_consent,
        "message": ev_msg,
    }


@router.post("/batteries/{battery_id}/request-assessment")
def request_battery_assessment(
    battery_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """EV Owner requests professional second-life or diagnostic assessment."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    bat.sharing_consent = True
    bat.sharing_status = "PENDING_ASSESSMENT"
    bat.updated_at = _utcnow()

    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="ASSESSMENT_REQUESTED",
            location=f"{bat.city or 'Customer'}, {bat.state or 'India'}",
            handler="EVolve AI Circular Network",
            status="PENDING_ASSESSMENT",
            evidence_ref=f"REQ-ASSESS-{bat.battery_id}",
            actor="customer",
        )
    )
    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "sharing_status": bat.sharing_status,
        "message": "Assessment request submitted. Authorized diagnostic centers can now review battery specifications.",
    }


@router.post("/batteries/{battery_id}/report-eol")
def report_battery_eol(
    battery_id: str,
    payload: CustomerReportEolRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    EV Owner reports an end-of-life or discarded battery for assessment and circular pathway assignment.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    report_id = f"EOL-{uuid.uuid4().hex[:8].upper()}"

    # Create BatteryDisposalReport
    report = BatteryDisposalReport(
        report_id=report_id,
        battery_id=bat.id,
        user_id=current_user.id,
        reporting_reason=payload.reporting_reason,
        current_condition=payload.current_condition,
        professionally_assessed=payload.professionally_assessed,
        assessment_notes=payload.assessment_notes,
        collection_city=payload.collection_city,
        collection_state=payload.collection_state,
        collection_pincode=payload.collection_pincode,
        sharing_consent=payload.sharing_consent,
        status="PENDING_ASSESSMENT",
        supporting_details=payload.supporting_details,
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(report)

    # Update battery record
    bat.reported_condition = payload.current_condition
    bat.eol_reported_at = _utcnow()
    bat.eol_reason = payload.reporting_reason
    bat.is_professionally_assessed = payload.professionally_assessed
    bat.city = payload.collection_city
    bat.state = payload.collection_state
    bat.sharing_consent = payload.sharing_consent
    if payload.sharing_consent:
        bat.sharing_status = "PENDING_ASSESSMENT"
    else:
        bat.sharing_status = "PRIVATE"
    bat.collection_status = "PENDING_ASSESSMENT"
    bat.lifecycle_status = "EOL_CANDIDATE"
    bat.updated_at = _utcnow()

    # Append lifecycle event
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="END_OF_LIFE_REPORTED",
            location=f"{payload.collection_city}, {payload.collection_state}",
            handler="EVolve AI Customer Registry",
            status="PENDING_ASSESSMENT",
            evidence_ref=report_id,
            actor=current_user.username,
        )
    )

    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "report_id": report_id,
        "battery_id": bat.battery_id,
        "message": "Your battery end-of-life assessment request has been successfully submitted.",
        "next_steps": [
            "Diagnostic assessment scheduled with a certified circular partner",
            "Technical safety evaluation for potential second-life repurposing or recycling",
            "Recommendation generated (Stationary Energy Storage vs Hydrometallurgical Recycling)",
            "Collection logistics scheduled upon diagnostic completion",
        ],
        "disclaimer": (
            "Safety Advisory: Do NOT attempt to open, dismantle, or transport high-voltage EV batteries yourself. "
            "Unauthorized handling can cause severe electric shock, thermal runaway fire, or toxic chemical exposure. "
            "EVolve AI and certified partners coordinate all hazardous material handling."
        ),
    }


@router.get("/discarded-batteries")
def list_my_discarded_batteries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List all batteries reported for end-of-life assessment by the authenticated customer.
    """
    reports = (
        db.query(BatteryDisposalReport)
        .filter(BatteryDisposalReport.user_id == current_user.id)
        .order_by(BatteryDisposalReport.created_at.desc())
        .all()
    )

    items = []
    seen_battery_ids = set()

    for rep in reports:
        bat = rep.battery
        if not bat:
            continue
        seen_battery_ids.add(bat.id)
        soh_pct = round(bat.current_soh * 100.0, 1) if bat.current_soh is not None else None
        items.append({
            "report_id": rep.report_id,
            "battery_id": bat.battery_id,
            "battery_uid": bat.battery_uid,
            "vehicle_model": bat.vehicle_model or "EV",
            "vehicle_manufacturer": bat.vehicle_manufacturer or "Tata",
            "purchase_year": bat.purchase_year or 2024,
            "reported_at": rep.created_at.isoformat(),
            "reporting_reason": rep.reporting_reason,
            "current_condition": rep.current_condition,
            "professionally_assessed": rep.professionally_assessed,
            "assessment_notes": rep.assessment_notes,
            "collection_city": rep.collection_city,
            "collection_state": rep.collection_state,
            "sharing_consent": rep.sharing_consent,
            "sharing_status": bat.sharing_status,
            "lifecycle_status": bat.lifecycle_status,
            "collection_status": bat.collection_status,
            "second_life_suitability": bat.second_life_suitability or "NOT_ASSESSED",
            "soh_pct": soh_pct,
            "enquiries_count": len(bat.enquiries) if bat.enquiries else 0,
        })

    other_bats = (
        db.query(Battery)
        .filter(
            Battery.user_id == current_user.id,
            Battery.id.notin_(seen_battery_ids) if seen_battery_ids else True,
            (Battery.eol_reported_at.is_not(None)) | (Battery.lifecycle_status.in_(["EOL_CANDIDATE", "SECOND_LIFE_CANDIDATE", "RECYCLED", "RECOVERED"]))
        )
        .all()
    )
    for bat in other_bats:
        soh_pct = round(bat.current_soh * 100.0, 1) if bat.current_soh is not None else None
        items.append({
            "report_id": f"EOL-{bat.battery_id}",
            "battery_id": bat.battery_id,
            "battery_uid": bat.battery_uid,
            "vehicle_model": bat.vehicle_model or "EV",
            "vehicle_manufacturer": bat.vehicle_manufacturer or "Tata",
            "purchase_year": bat.purchase_year or 2024,
            "reported_at": bat.eol_reported_at.isoformat() if bat.eol_reported_at else bat.updated_at.isoformat(),
            "reporting_reason": bat.eol_reason or "End of vehicle life service",
            "current_condition": bat.reported_condition or "Reduced performance",
            "professionally_assessed": bat.is_professionally_assessed,
            "assessment_notes": None,
            "collection_city": bat.city or "Hyderabad",
            "collection_state": bat.state or "Telangana",
            "sharing_consent": bat.sharing_consent,
            "sharing_status": bat.sharing_status,
            "lifecycle_status": bat.lifecycle_status,
            "collection_status": bat.collection_status,
            "second_life_suitability": bat.second_life_suitability or "NOT_ASSESSED",
            "soh_pct": soh_pct,
            "enquiries_count": len(bat.enquiries) if bat.enquiries else 0,
        })

    return {
        "count": len(items),
        "discarded_batteries": items,
    }


@router.get("/batteries/{battery_id}/enquiries")
def get_customer_battery_enquiries(
    battery_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    EV Owner views anonymized inquiry activity regarding their shared battery record.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    enquiries = (
        db.query(BatteryEnquiry)
        .filter(BatteryEnquiry.battery_id == bat.id)
        .order_by(BatteryEnquiry.created_at.desc())
        .all()
    )

    items = []
    for enq in enquiries:
        items.append({
            "enquiry_id": enq.enquiry_id,
            "created_at": enq.created_at.isoformat(),
            "enquiry_purpose": enq.enquiry_purpose,
            "intended_application": enq.intended_application,
            "status": enq.status,
            "response_notes": enq.response_notes,
        })

    return {
        "battery_id": bat.battery_id,
        "enquiries_count": len(items),
        "enquiries": items,
    }


@router.post("/batteries/{battery_id}/request-collection")
def request_battery_collection_by_id(
    battery_id: str,
    payload: BatteryCollectionByIdPayload | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """EV Owner requests end-of-life battery collection."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery not found.")
    if bat.user_id != current_user.id and current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Access denied. You do not own this battery record.")

    notes = payload.notes if payload and payload.notes else ""
    contact_phone = (payload.contact_phone if payload and payload.contact_phone else current_user.phone) or ""
    contact_name = (payload.contact_name if payload and payload.contact_name else current_user.full_name) or ""
    city = (payload.city if payload and payload.city else bat.city) or "Customer Location"
    state = (payload.state if payload and payload.state else bat.state) or "India"

    bat.collection_status = "SCHEDULED"
    bat.lifecycle_status = "EOL_CANDIDATE"
    if bat.sharing_consent:
        bat.sharing_status = "COLLECTION_SCHEDULED"
    bat.updated_at = _utcnow()

    task = db.query(CollectionTask).filter(CollectionTask.battery_id == bat.id).first()
    if not task:
        task = CollectionTask(
            battery_id=bat.id,
            priority_score=0.92,
            priority_band="CRITICAL",
            status="SCHEDULED",
            factors=json.dumps({
                "reason": "Owner requested collection",
                "soh": bat.current_soh,
                "notes": notes,
                "contact_name": contact_name,
                "contact_phone": contact_phone,
            }),
        )
        db.add(task)
    else:
        task.status = "SCHEDULED"

    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="COLLECTION_SCHEDULED",
            location=f"{city}, {state}",
            handler="Certified EVolve AI Circular Recycler",
            status="SCHEDULED",
            evidence_ref=f"COL-{bat.battery_id}",
            actor="customer",
        )
    )
    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "collection_status": bat.collection_status,
        "sharing_status": bat.sharing_status,
        "message": "Collection request confirmed. Authorized collection partners have been notified.",
    }


# ---------------------------------------------------------------------------
# 6. Request EOL Collection (Connects to Recycler Workflow)
# ---------------------------------------------------------------------------

@router.post("/collection-request")
def request_battery_collection(
    payload: CustomerCollectionRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Submits a battery collection request for end-of-life batteries.
    Directly updates the collection queue and lifecycle audit trail.
    """
    # Find matching assessment
    ass = db.query(CustomerAssessment).filter(
        (CustomerAssessment.assessment_id == payload.battery_id)
        | (CustomerAssessment.battery_uid == payload.battery_id)
        | (CustomerAssessment.id == (int(payload.battery_id) if payload.battery_id.isdigit() else -1))
    ).first()

    bat = None
    if ass and ass.battery_id:
        bat = db.query(Battery).filter(Battery.id == ass.battery_id).first()
    if not bat:
        bat = db.query(Battery).filter(
            (Battery.battery_id == payload.battery_id) | (Battery.battery_uid == payload.battery_id)
        ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    # Update collection statuses
    bat.collection_status = "SCHEDULED"
    bat.lifecycle_status = "EOL_CANDIDATE"

    if ass:
        ass.collection_status = "SCHEDULED"
        ass.collection_preferred_date = payload.preferred_date
        ass.collection_contact_name = payload.contact_name
        ass.collection_contact_phone = payload.contact_phone
        ass.collection_notes = payload.notes or ""

    # Ensure CollectionTask exists and is updated
    task = db.query(CollectionTask).filter(CollectionTask.battery_id == bat.id).first()
    if not task:
        task = CollectionTask(
            battery_id=bat.id,
            priority_score=0.92,
            priority_band="CRITICAL",
            status="SCHEDULED",
            factors=json.dumps({"source": "Customer pickup request", "phone": payload.contact_phone}),
        )
        db.add(task)
    else:
        task.status = "SCHEDULED"

    # Add append-only lifecycle event
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="COLLECTION_SCHEDULED",
            location=f"{payload.city}, {payload.state}",
            handler="Certified EVolve AI Circular Recycler",
            status="SCHEDULED",
            evidence_ref=f"COL-{payload.battery_id}",
            actor="customer",
        )
    )

    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "message": "Collection request confirmed. A certified recycling partner has scheduled your battery pickup.",
        "battery_id": bat.battery_id,
        "scheduled_date": payload.preferred_date,
        "collection_status": "SCHEDULED",
    }


# ---------------------------------------------------------------------------
# 7. Request Second-Life Assessment / Marketplace Listing
# ---------------------------------------------------------------------------

@router.post("/second-life-request")
def request_second_life(
    payload: CustomerSecondLifeRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Connects customer battery to the Second-Life marketplace.
    """
    ass = db.query(CustomerAssessment).filter(
        (CustomerAssessment.assessment_id == payload.battery_id)
        | (CustomerAssessment.battery_uid == payload.battery_id)
    ).first()

    bat = None
    if ass and ass.battery_id:
        bat = db.query(Battery).filter(Battery.id == ass.battery_id).first()
    if not bat:
        bat = db.query(Battery).filter(
            (Battery.battery_id == payload.battery_id) | (Battery.battery_uid == payload.battery_id)
        ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    bat.second_life_status = "MARKETPLACE_LISTED"
    bat.lifecycle_status = "SECOND_LIFE_CANDIDATE"

    if ass:
        ass.second_life_status = "MARKETPLACE_LISTED"
        ass.second_life_notes = payload.notes or ""

    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="SECOND_LIFE_MARKETPLACE_LISTED",
            location="EVolve AI Circular Exchange",
            handler="Second-Life Marketplace",
            status="LISTED",
            evidence_ref=f"SL-{payload.battery_id}",
            actor="customer",
        )
    )

    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "message": "Battery enrolled into the Second-Life Marketplace. Available for stationary storage applications.",
        "battery_id": bat.battery_id,
        "marketplace_status": "LISTED",
    }


# ---------------------------------------------------------------------------
# 8. Demo Presets
# ---------------------------------------------------------------------------

@router.get("/demo-vehicles")
def get_demo_vehicles() -> dict[str, Any]:
    """Returns curated demo EV presets for instant customer workflow testing."""
    presets = estimator.get_demo_presets()
    return {"count": len(presets), "presets": presets}


# ---------------------------------------------------------------------------
# 9. Second-Life Consumer Marketplace Route
# ---------------------------------------------------------------------------

@consumer_router.get("/second-life-marketplace")
def get_second_life_marketplace(db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Consumer interface: Marketplace of second-life batteries suitable for
    stationary storage, commercial microgrids, and solar energy backup.
    """
    # Query batteries that are second-life candidates or customer assessed as second-life
    query_bats = (
        db.query(Battery)
        .filter(
            (Battery.second_life_status.in_(["CANDIDATE", "MARKETPLACE_LISTED", "PENDING_ASSESSMENT"]))
            | (Battery.lifecycle_status == "SECOND_LIFE_CANDIDATE")
            | ((Battery.current_soh >= 0.55) & (Battery.current_soh < 0.75))
        )
        .limit(30)
        .all()
    )

    listings = []
    for b in query_bats:
        soh_pct = round(b.current_soh * 100.0, 1)
        usable_kwh = round(b.rated_capacity_kwh * (soh_pct / 100.0), 1)
        # Indicative storage price in INR ~ ₹7,500 - ₹9,500 per usable kWh
        est_price = round(usable_kwh * 8200.0, -2)

        veh = db.query(Vehicle).filter(Vehicle.id == b.vehicle_id).first()
        veh_name = veh.model_name if veh else "EV Battery Pack"
        loc = f"{veh.zone if veh else 'India'}"

        listings.append({
            "listing_id": f"SL-{b.battery_id}",
            "battery_id": b.battery_id,
            "battery_uid": b.battery_uid,
            "vehicle_model": veh_name,
            "chemistry": b.chemistry,
            "rated_capacity_kwh": b.rated_capacity_kwh,
            "usable_capacity_kwh": usable_kwh,
            "health_soh_pct": soh_pct,
            "cycles_completed": b.charging_cycles,
            "condition": "Good for Stationary Storage" if soh_pct >= 65 else "Fair for Low-C Applications",
            "ideal_applications": [
                "Home Solar Backup",
                "Farm Water Pumping",
                "Telecom Tower UPS",
            ] if soh_pct >= 65 else [
                "Low-load Street Lighting",
                "Emergency Off-grid Pack",
            ],
            "estimated_price_inr": est_price,
            "location": loc,
            "status": "Available" if b.second_life_status == "MARKETPLACE_LISTED" else "Pending Assessment",
            "source": b.data_source,
        })

    return {
        "count": len(listings),
        "marketplace_notice": "Second-life batteries require certified technical testing before deployment.",
        "listings": listings,
    }


class ConsumerMatchRequest(BaseModel):
    application: str = Field(default="Solar Storage", description="Application: Solar Storage, Home Backup, Commercial Storage, Telecom Backup, Microgrid")
    required_capacity_kwh: float = Field(default=25.0, description="Required capacity in kWh")
    min_soh_pct: float = Field(default=65.0, description="Minimum battery health SOH %")
    chemistry_preference: str = Field(default="ALL", description="Chemistry: ALL, LFP, NMC")
    budget_max_inr: float | None = Field(default=None, description="Optional maximum budget in INR")


@consumer_router.post("/match")
def match_second_life_batteries(
    payload: ConsumerMatchRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    AI-driven second-life battery matching engine.
    Matches retired EV battery packs to stationary storage applications.
    """
    query_bats = (
        db.query(Battery)
        .filter(
            (Battery.second_life_status.in_(["CANDIDATE", "MARKETPLACE_LISTED", "PENDING_ASSESSMENT"]))
            | (Battery.lifecycle_status == "SECOND_LIFE_CANDIDATE")
            | ((Battery.current_soh >= 0.55) & (Battery.current_soh < 0.85))
        )
        .all()
    )

    matches = []
    for b in query_bats:
        soh_pct = round(b.current_soh * 100.0, 1)
        usable_kwh = round(b.rated_capacity_kwh * (soh_pct / 100.0), 1)
        est_price = round(usable_kwh * 8200.0, -2)

        # Chemistry filter
        if payload.chemistry_preference != "ALL" and b.chemistry != payload.chemistry_preference:
            continue

        # Budget filter
        if payload.budget_max_inr and est_price > payload.budget_max_inr:
            continue

        # Compute match score (0 - 100%)
        # 1. Capacity alignment (40% weight)
        cap_diff = abs(usable_kwh - payload.required_capacity_kwh)
        cap_ratio = max(0.0, 1.0 - (cap_diff / max(payload.required_capacity_kwh, 10.0)))
        cap_score = min(1.0, cap_ratio) * 40.0

        # 2. Health suitability (35% weight)
        if soh_pct >= payload.min_soh_pct:
            health_score = 35.0
        else:
            health_score = max(0.0, 35.0 - (payload.min_soh_pct - soh_pct) * 3.5)

        # 3. Application suitability (25% weight)
        app_score = 25.0
        if payload.application in ["Solar Storage", "Commercial Storage", "Microgrid"] and b.chemistry == "LFP":
            app_score = 25.0  # LFP is optimal for deep-cycle solar
        elif payload.application in ["Home Backup", "Telecom Backup"]:
            app_score = 23.0

        total_match = round(cap_score + health_score + app_score)
        total_match = max(55, min(99, total_match))

        veh = db.query(Vehicle).filter(Vehicle.id == b.vehicle_id).first()
        veh_name = veh.model_name if veh else "EV Battery Pack"
        loc = veh.zone if veh else "Telangana"

        # Plain-English reason
        reason = (
            f"Suitable capacity ({usable_kwh} kWh vs {payload.required_capacity_kwh} kWh requested) "
            f"and robust {soh_pct}% health with {b.chemistry} chemistry for your {payload.application} system."
        )

        matches.append({
            "listing_id": f"SL-{b.battery_id}",
            "battery_id": b.battery_id,
            "battery_uid": b.battery_uid,
            "vehicle_model": veh_name,
            "chemistry": b.chemistry,
            "rated_capacity_kwh": b.rated_capacity_kwh,
            "usable_capacity_kwh": usable_kwh,
            "health_soh_pct": soh_pct,
            "cycles_completed": b.charging_cycles,
            "estimated_price_inr": est_price,
            "location": loc,
            "match_score_pct": total_match,
            "match_reason": reason,
            "status": "Available",
        })

    matches.sort(key=lambda x: x["match_score_pct"], reverse=True)
    return {
        "application": payload.application,
        "required_capacity_kwh": payload.required_capacity_kwh,
        "count": len(matches),
        "matches": matches,
    }


class ConsumerRequisitionRequest(BaseModel):
    battery_id: str
    buyer_name: str
    contact_phone: str
    application: str
    shipping_address: str | None = None
    notes: str | None = None


@consumer_router.post("/request")
def submit_second_life_requisition(
    payload: ConsumerRequisitionRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Submits a consumer request to acquire a second-life battery pack.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == payload.battery_id)
        | (Battery.battery_uid == payload.battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery pack not found.")

    bat.second_life_status = "ALLOCATED"
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="SECOND_LIFE_REQUISITION_RECEIVED",
            location=bat.vehicle.zone if bat.vehicle else "National",
            handler=f"Consumer: {payload.buyer_name}",
            status="RESERVED",
            evidence_ref=f"REQ-{payload.battery_id}",
            actor="consumer",
        )
    )
    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "message": f"Pack {bat.battery_id} reserved for {payload.buyer_name} ({payload.application}). Our dispatch partner will reach out for delivery scheduling.",
    }


@consumer_router.get("/enquiries")
def list_consumer_enquiries_alias(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from .recycling_routes import list_my_consumer_enquiries
    return list_my_consumer_enquiries(current_user=current_user, db=db)


@consumer_router.get("/parts-guide")
def get_consumer_parts_guide_alias(
    chemistry: str | None = None,
) -> dict[str, Any]:
    from .recycling_routes import get_battery_parts_guide
    return get_battery_parts_guide(chemistry=chemistry)


# ---------------------------------------------------------------------------
# Helper Formatters
# ---------------------------------------------------------------------------

def _format_customer_report(
    ass: CustomerAssessment,
    battery: Battery | None,
    vehicle: Vehicle | None,
) -> dict[str, Any]:
    soh_pct = round(ass.soh_predicted * 100.0, 1)

    if soh_pct >= 80.0:
        tone = "green"
        dot = "bg-emerald-500"
    elif soh_pct >= 70.0:
        tone = "yellow"
        dot = "bg-amber-500"
    elif soh_pct >= 55.0:
        tone = "orange"
        dot = "bg-orange-500"
    else:
        tone = "red"
        dot = "bg-rose-500"

    derived = json.loads(ass.derived_features) if ass.derived_features else {}
    provenance = json.loads(ass.feature_provenance) if ass.feature_provenance else {}
    why_points = json.loads(ass.why_explanation) if ass.why_explanation else []

    # Format remaining years display
    eol_years = ass.estimated_remaining_years
    if eol_years >= 1.0:
        years_display = f"{eol_years:.1f}+ years"
    elif eol_years > 0:
        years_display = f"{int(round(eol_years * 12))} months"
    else:
        years_display = "Immediate EOL"

    return {
        "assessment_id": ass.assessment_id,
        "battery_id": battery.battery_id if battery else f"BAT-{ass.assessment_id}",
        "battery_uid": ass.battery_uid or (battery.battery_uid if battery else "BLID-PENDING"),
        "created_at": ass.created_at.isoformat(),
        "is_demo": ass.is_demo,
        "vehicle": {
            "brand": ass.vehicle_brand,
            "model": ass.vehicle_model,
            "purchase_year": ass.purchase_year,
            "odometer_km": ass.odometer_km,
            "city": ass.city,
            "state": ass.state,
        },
        "health": {
            "soh_pct": soh_pct,
            "status_band": ass.soh_health_band,
            "status_tone": tone,
            "status_dot": dot,
            "display_title": f"{int(round(soh_pct))}% — {ass.soh_health_band}",
            "disclaimer": "AI-estimated battery health derived from your vehicle usage and reported symptoms.",
        },
        "future_risk": {
            "level": ass.future_risk,
            "tone": "bad" if ass.future_risk == "High" else "warn" if ass.future_risk == "Medium" else "good",
            "summary": (
                "Your battery is showing accelerated wear and may require intervention soon."
                if ass.future_risk == "High" else
                "Your battery is showing normal wear with moderate future degradation potential."
                if ass.future_risk == "Medium" else
                "Low risk of unexpected failure under current driving patterns."
            ),
        },
        "remaining_life": {
            "years_display": years_display,
            "months_estimated": round(eol_years * 12.0, 1),
            "note": "Projected remaining EV traction life assuming current driving and charging patterns continue.",
        },
        "second_life": {
            "potential": ass.second_life_potential,
            "description": (
                "High potential for stationary energy storage or home backup after EV retirement."
                if ass.second_life_potential == "High" else
                "Moderate potential; currently optimal for active vehicle usage."
                if ass.second_life_potential == "Medium" else
                "Low second-life suitability; best directed to certified recycling."
            ),
            "status": ass.second_life_status,
        },
        "recommendation": {
            "action_code": ass.recommended_action,
            "title": ass.recommendation_title,
            "summary": ass.recommendation_message,
            "collection_status": ass.collection_status,
            "second_life_status": ass.second_life_status,
        },
        "why_points": why_points,
        "ai_explanation": ass.ai_explanation,
        "confidence": {
            "confidence_pct": ass.confidence_score,
            "confidence_band": ass.confidence_band,
            "label": f"{int(round(ass.confidence_score))}%",
            "notice": "Analysis Confidence based on the completeness of your provided details.",
        },
        "cost_estimation": estimator.estimate_battery_costs(
            capacity_kwh=ass.battery_capacity_kwh or derived.get("rated_capacity_kwh", 40.0),
            chemistry=ass.battery_chemistry or derived.get("chemistry", "LFP"),
            soh_pct=soh_pct,
            vehicle_model=ass.vehicle_model,
            pathway=ass.recommended_action or "SECOND_LIFE_ASSESSMENT",
        ),
        "manufacturer_support": manufacturer_support.build_manufacturer_advisory(
            brand=getattr(ass, "vehicle_brand", "Tata"),
            country_code="IN",
            model=getattr(ass, "vehicle_model", "Nexon EV"),
            is_diagnostic_confirmed=bool(getattr(ass, "is_professionally_assessed", False))
            or (bool(getattr(battery, "is_professionally_assessed", False)) if battery else False),
            has_critical_warning=str(getattr(ass, "warning_condition", "") or "").lower()
            in ("critical", "overheating", "thermal", "severe"),
        ),
        "technical_details": {
            "derived_features": derived,
            "feature_provenance": provenance,
            "model_outputs": {
                "soh_predicted": ass.soh_predicted,
                "eol_months": round(eol_years * 12.0, 1),
                "anomaly_score": round(derived.get("cell_voltage_spread_mv", 20.0) / 100.0, 3),
            },
        },
    }


def _synthesize_report_from_battery(bat: Battery, db: Session) -> dict[str, Any]:
    """Helper when a standard Battery row is queried through the customer endpoint."""
    veh = db.query(Vehicle).filter(Vehicle.id == bat.vehicle_id).first()
    soh_pct = round(bat.current_soh * 100.0, 1)

    cost_est = estimator.estimate_battery_costs(
        capacity_kwh=bat.rated_capacity_kwh or 40.0,
        chemistry=bat.chemistry or "LFP",
        soh_pct=soh_pct,
        vehicle_model=veh.model_name if veh else "Electric Vehicle",
        pathway="SECOND_LIFE_ASSESSMENT" if soh_pct < 75 else "CONTINUE_USE",
    )

    brand_guess = veh.model_name.split()[0] if veh and veh.model_name else "EV"

    return {
        "assessment_id": bat.battery_id,
        "battery_id": bat.battery_id,
        "battery_uid": bat.battery_uid,
        "created_at": bat.created_at.isoformat(),
        "is_demo": bat.data_source == "SIMULATED",
        "vehicle": {
            "brand": brand_guess,
            "model": veh.model_name if veh else "Electric Vehicle",
            "purchase_year": bat.manufactured_on.year,
            "odometer_km": veh.distance_travelled_km if veh else 40000,
            "city": veh.zone if veh else "India",
            "state": "National",
        },
        "health": {
            "soh_pct": soh_pct,
            "status_band": "Good" if soh_pct >= 80 else "Fair" if soh_pct >= 70 else "Needs Attention",
            "status_tone": "green" if soh_pct >= 80 else "yellow",
            "status_dot": "bg-emerald-500" if soh_pct >= 80 else "bg-amber-500",
            "display_title": f"{int(round(soh_pct))}% — {'Good' if soh_pct >= 80 else 'Fair'}",
            "disclaimer": "Derived from vehicle telematics data.",
        },
        "future_risk": {"level": "Low" if soh_pct >= 80 else "Medium", "summary": "Normal operation."},
        "remaining_life": {"years_display": "2.5+ years", "months_estimated": 30.0, "note": "Projected EV life."},
        "second_life": {"potential": "High" if soh_pct < 75 else "Medium", "description": "Viable for stationary storage."},
        "recommendation": {
            "action_code": "CONTINUE_USE" if soh_pct >= 75 else "SECOND_LIFE_ASSESSMENT",
            "title": "Continue using your EV" if soh_pct >= 75 else "Consider Second-Life Assessment",
            "summary": "Battery in operational condition.",
            "collection_status": bat.collection_status,
            "second_life_status": bat.second_life_status,
        },
        "why_points": [
            f"Current battery SOH is {soh_pct}%.",
            f"Logged charging cycles: {bat.charging_cycles}.",
            "Thermal parameters are within design limits.",
        ],
        "ai_explanation": None,
        "confidence": {"confidence_pct": 92.0, "confidence_band": "HIGH", "label": "92%"},
        "cost_estimation": cost_est,
        "manufacturer_support": manufacturer_support.build_manufacturer_advisory(
            brand=brand_guess,
            country_code="IN",
            model=veh.model_name if veh else "Electric Vehicle",
            is_diagnostic_confirmed=False,
            has_critical_warning=soh_pct < 55.0,
            db=db,
        ),
        "technical_details": {
            "derived_features": {"soh": bat.current_soh, "cycles": bat.charging_cycles},
            "feature_provenance": {"soh": "MODEL_OUTPUT", "cycles": "USER_PROVIDED"},
            "model_outputs": {"soh_predicted": bat.current_soh},
        },
    }


# ---------------------------------------------------------------------------
# Manufacturer Support Directory Endpoints
# ---------------------------------------------------------------------------

@manufacturer_router.get("/support")
@router.get("/manufacturers/support")
def get_manufacturer_support(
    brand: str | None = Query(None, description="Vehicle brand or manufacturer name"),
    country: str | None = Query("IN", description="Country/Market code (e.g. IN, US)"),
    model: str | None = Query(None, description="Vehicle model name"),
    diagnostic_confirmed: bool = Query(False, description="Whether diagnostic scan confirms replacement requirement"),
    critical_warning: bool = Query(False, description="Whether critical thermal/safety alerts are active"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Retrieve verified official customer-care support contacts, authorized service locator,
    and 'Verify Before You Replace' advisory for a vehicle and market.
    """
    return manufacturer_support.build_manufacturer_advisory(
        brand=brand,
        country_code=country,
        model=model,
        is_diagnostic_confirmed=diagnostic_confirmed,
        has_critical_warning=critical_warning,
        db=db,
    )


@manufacturer_router.get("/directory")
@router.get("/manufacturers/directory")
def get_manufacturers_directory(
    country: str | None = Query(None, description="Optional country code filter"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List supported vehicle manufacturers and verification statuses for dropdown selection.
    """
    manufacturers = manufacturer_support.list_supported_manufacturers(db=db, country_code=country)
    return {
        "count": len(manufacturers),
        "country": country,
        "manufacturers": manufacturers,
    }

