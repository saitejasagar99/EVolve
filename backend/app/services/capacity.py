"""
Module 8 - Collection & Processing Capacity Planning.

Compares predicted EOL volume against downstream capacity and reports a GAP,
because "42 batteries arrive, 30 can be processed" is the operational crisis
this whole product exists to surface.

Capacity is read from the `processing_handlers` table (real records), not
hardcoded, and the shortfall maths is returned with the answer.
"""

from __future__ import annotations

from typing import Any

from .. import config
from ..database.models import ProcessingHandler
from .prevention import EOL_CANDIDATE


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math

    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def capacity_plan(
    db,
    forecast: dict[str, Any],
    decisions: list[dict[str, Any]],
    records: list[dict[str, Any]],
    *,
    processing_capacity: int | None = None,
    collection_capacity: int | None = None,
    trips_per_month: int | None = None,
) -> dict[str, Any]:
    """
    Compare predicted inflow against downstream capacity.

    Handlers are read from the database. `processing_capacity` / etc. override
    for the what-if simulator, so one function serves both Module 8 and 12.
    """
    handlers = db.query(ProcessingHandler).filter(ProcessingHandler.active.is_(True)).all()

    if processing_capacity is None:
        recyclers = [h for h in handlers if h.kind == "RECYCLER"]
        processing_capacity = sum(h.monthly_capacity_units for h in recyclers)

    if collection_capacity is None:
        collection_capacity = config.DEFAULT_COLLECTION_CAPACITY_PER_MONTH
    if trips_per_month is None:
        trips_per_month = config.DEFAULT_COLLECTION_TRIPS_PER_MONTH

    refurbishers = [h for h in handlers if h.kind == "REFURBISHER"]
    refurb_capacity = sum(h.monthly_capacity_units for h in refurbishers)

    # Inflow that genuinely needs downstream processing = EOL candidates that
    # prevention could NOT retain.
    eol_units = sum(1 for d in decisions if d["pathway"] == EOL_CANDIDATE)

    monthly_inflow = forecast["monthly_forecast"]
    peak = max((m["expected_eol"] for m in monthly_inflow), default=0.0)
    horizon_total = forecast["headline"]["potential_eol_12_months"]

    # Mean monthly inflow across the forecast horizon.
    mean_inflow = round(horizon_total / config.FORECAST_HORIZON_MONTHS, 2)

    processing_gap = round(peak - processing_capacity, 2)
    collection_gap = round(peak - collection_capacity, 2)

    if processing_gap > 0 and peak > 0:
        status = "CAPACITY_MISMATCH"
        recommendation = (
            f"Peak predicted inflow of {peak:.1f} units/month exceeds available processing "
            f"capacity of {processing_capacity} units/month by {processing_gap:.1f} units. "
            "Increase downstream processing capacity or stagger the collection schedule "
            "so batches do not arrive faster than they can be processed."
        )
    elif peak == 0:
        status = "NO_FORECAST_INFLOW"
        recommendation = "No EOL inflow is forecast in this horizon, so no capacity action is required."
    else:
        status = "CAPACITY_SUFFICIENT"
        headroom = round(processing_capacity - peak, 2)
        recommendation = (
            f"Peak predicted inflow of {peak:.1f} units/month sits within the "
            f"{processing_capacity} units/month processing capacity, leaving "
            f"{headroom:.1f} units/month headroom. Monitor as the fleet ages."
        )

    # Unverified handlers are a supply-chain traceability risk, not a
    # compliance judgement - surfaced so procurement can act on it.
    unverified = [h for h in handlers if h.certification_status != "VERIFIED"]

    return {
        "status": status,
        "recommendation": recommendation,
        "demand": {
            "eol_candidates_total": eol_units,
            "forecast_12_month_units": horizon_total,
            "mean_monthly_units": mean_inflow,
            "peak_monthly_units": round(peak, 2),
            "peak_month": forecast["peak_month"],
        },
        "supply": {
            "processing_capacity_units_per_month": processing_capacity,
            "refurbishment_capacity_units_per_month": refurb_capacity,
            "collection_capacity_units_per_month": collection_capacity,
            "collection_trips_per_month": trips_per_month,
            "trip_capacity_units": config.DEFAULT_TRIP_CAPACITY_UNITS,
        },
        "gap": {
            "processing_gap_units": max(processing_gap, 0.0),
            "collection_gap_units": max(collection_gap, 0.0),
            "processing_utilisation_pct": (
                round(peak / processing_capacity * 100, 1) if processing_capacity else None
            ),
        },
        "handlers": [
            {
                "handler_id": h.handler_id,
                "name": h.name,
                "kind": h.kind,
                "zone": h.zone,
                "monthly_capacity_units": h.monthly_capacity_units,
                "certification_status": h.certification_status,
            }
            for h in handlers
        ],
        "unverified_handler_count": len(unverified),
        "unverified_handler_note": (
            f"{len(unverified)} downstream handler(s) have unverified certification "
            "status. Treat as a supply-chain traceability risk for EPR-ready evidence."
            if unverified else
            "All downstream handlers have verified certification status."
        ),
        "method": (
            "Peak predicted monthly inflow from the EOL forecast is compared against "
            "capacity summed from active rows in the processing_handlers table."
        ),
        "label": "ESTIMATED PLANNING FIGURE",
    }