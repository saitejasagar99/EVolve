"""HTTP routes.

Every route returns either computed data or an explicit, actionable error.
No endpoint invents a number, and no endpoint silently returns an empty result
without saying why.
"""

from __future__ import annotations

import io
from typing import Any

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import config
from ..data.demo_seed import (
    SIM_NOTICE,
    build_battery_specs,
    required_columns,
    seed_demo,
    upload_template_frame,
)
from ..database.base import get_db, session_scope
from ..database.models import Battery, LifecycleEvent, Vehicle
from ..ml.trainer import load_metrics, robustness_ablation, train_all, verify_not_hardcoded
from ..schemas.models import (
    BatchRequest,
    DemoLoadRequest,
    ExplainRequest,
    InterventionDecision,
    SimulateRequest,
)
from ..services import (
    analytics,
    capacity as capacity_mod,
    collection as collection_mod,
    fleet as fleet_mod,
    genai,
    prevention as prevention_mod,
    simulator,
    traceability as traceability_mod,
)

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _baseline(db: Session, force: bool = False) -> dict[str, Any]:
    try:
        return analytics.build_baseline(db, force=force)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _empty_guard(db: Session) -> None:
    n = db.query(Battery).count()
    if n == 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "The database is empty. Click 'Load Demo Fleet' or POST /api/demo/load "
                "to populate the synthetic dataset."
            ),
        )


def _provenance(db: Session) -> dict[str, Any]:
    rows = db.query(Battery.data_source).distinct().all()
    sources = sorted({r[0] for r in rows})
    n = db.query(Battery).count()
    simulated = (not sources) or (sources == ["SIMULATED"])
    return {
        "simulated": simulated,
        "sources": sources,
        "row_count": n,
        "label": "SYNTHETIC DEMO DATA" if simulated else "OPERATOR-UPLOADED DATA",
        "notice": (
            SIM_NOTICE if simulated else
            "Rows supplied by an operator. Not validated against a physical BMS."
        ),
    }


# ---------------------------------------------------------------------------
# Health / meta
# ---------------------------------------------------------------------------

@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, Any]:
    bundle_ready = False
    try:
        from ..ml.trainer import ModelBundle

        bundle_ready = ModelBundle().ready
    except Exception:
        bundle_ready = False
    return {
        "status": "ok",
        "models_trained": bundle_ready,
        "genai_key_configured": genai.genai_available(),
        "genai_mode": "external+fallback" if genai.genai_available() else "local-fallback",
        "batteries": db.query(Battery).count(),
        "provenance": _provenance(db),
    }


@router.get("/meta")
def meta(db: Session = Depends(get_db)) -> dict[str, Any]:
    from ..database.models import ProcessingHandler

    handlers = db.query(ProcessingHandler).filter(ProcessingHandler.active.is_(True)).all()
    return {
        "app": "EVolve AI",
        "positioning": "Intelligent EV Battery Waste Management and Circularity Decision Platform",
        "workflow": ["PREDICT", "PREVENT", "OPTIMIZE", "TRACE"],
        "thresholds": {
            "eol_soh_pct": config.EOL_SOH_THRESHOLD * 100,
            "traction_use_floor_soh_pct": config.UNFIT_FOR_TRACTION_SOH * 100,
            "second_life_floor_soh_pct": config.SECOND_LIFE_FLOOR_SOH * 100,
            "forecast_horizon_months": config.FORECAST_HORIZON_MONTHS,
            "anomaly_review_threshold": 0.55,
        },
        "upload_required_columns": required_columns(),
        "cost_basis_inr": prevention_mod.UNIT_COSTS_INR,
        "pathway_labels": prevention_mod.PATHWAY_LABELS,
        "lifecycle_sequence": traceability_mod.LIFECYCLE_ORDER,
        "capacity": {
            "default_trip_capacity_units": config.DEFAULT_TRIP_CAPACITY_UNITS,
            "default_trips_per_month": config.DEFAULT_COLLECTION_TRIPS_PER_MONTH,
            "handler_capacity_units": sum(h.monthly_capacity_units for h in handlers),
        },
        "disclaimer": (
            "EVolve AI is a decision-support prototype. Battery health, RUL and lifecycle "
            "recommendations are estimates based on available data and do not replace "
            "certified technical inspection, safety assessment or regulatory compliance "
            "processes."
        ),
        "responsibility_statement": (
            "EVolve AI does not certify a battery safe or unsafe, does not guarantee an RUL "
            "or failure date, and does not assert official regulatory or EPR compliance."
        ),
    }


# ---------------------------------------------------------------------------
# Demo data
# ---------------------------------------------------------------------------

@router.post("/demo/load")
def demo_load(payload: DemoLoadRequest | None = None, db: Session = Depends(get_db)) -> dict[str, Any]:
    payload = payload or DemoLoadRequest()

    # seed_demo() calls reset_db(), which issues DDL (DROP/CREATE TABLE).
    # SQLite refuses to run DDL inside a transaction, so the reset and the
    # seed must run on their own connection rather than in the request's
    # already-open transaction. Commit what we have first, hand the seeding to
    # session_scope(), and let it commit on the way out.
    db.commit()
    with session_scope() as seed_db:
        info = seed_demo(seed_db, n=payload.count, reset=payload.reset)
    db.expire_all()

    fleet_mod.invalidate()
    fleet_mod.load_records(force=True)
    return {
        "status": "loaded",
        "batteries": info["batteries"],
        "vehicles": info["vehicles"],
        "fleets": info["fleets"],
        "handlers": info["handlers"],
        "notice": info["notice"],
        "simulated": True,
        "next": "GET /api/fleet/summary to see the analysis.",
    }


@router.get("/demo/template.csv")
def demo_template() -> Response:
    """Download a correctly-shaped CSV so an upload can be validated."""
    csv = upload_template_frame().to_csv(index=False).encode("utf-8")
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="evolve_upload_template.csv"'},
    )


# ---------------------------------------------------------------------------
# ML
# ---------------------------------------------------------------------------

@router.get("/ml/metrics")
def ml_metrics() -> dict[str, Any]:
    return load_metrics()


@router.post("/ml/train")
def ml_train() -> dict[str, Any]:
    return {"status": "trained", "metrics": train_all(verbose=False)}


@router.get("/ml/verify")
def ml_verify() -> dict[str, Any]:
    return verify_not_hardcoded()


@router.get("/ml/robustness")
def ml_robustness() -> dict[str, Any]:
    try:
        return robustness_ablation()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Fleet
# ---------------------------------------------------------------------------

@router.get("/fleet/summary")
def fleet_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    return {
        "summary": b["summary"],
        "data_quality": b["quality_summary"],
        "provenance": _provenance(db),
        "note": "All figures computed from the active dataset at request time.",
    }


def _join_pathways(b: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Merge the analysed records with their prevention decisions.

    Single source for both /api/fleet/vehicles and /api/batteries so the two
    endpoints cannot drift apart.
    """
    dec_by_id = {d["battery_id"]: d for d in b["decisions"]}
    rows = []
    for r in b["records"]:
        d = dec_by_id.get(r["battery_id"], {})
        rows.append(
            {
                **r,
                "pathway": d.get("pathway"),
                "pathway_label": d.get("pathway_label"),
                "pathway_actionable": d.get("actionable"),
                "rules_fired": [x["rule"] for x in d.get("rules_fired", [])],
                "potential_avoided_units": d.get("potential_avoided_units", 0.0),
            }
        )
    return rows


def _apply_filters(
    rows: list[dict[str, Any]],
    *,
    pathway: str | None,
    lifecycle_status: str | None,
    zone: str | None,
    min_soh: float | None,
    max_soh: float | None,
    max_eol: float | None,
    anomaly_only: bool,
    confidence_band: str | None,
    search: str | None,
    sort_by: str,
    order: str,
) -> list[dict[str, Any]]:
    """
    The one filter/sort implementation used by every battery listing endpoint.

    FastAPI silently ignores unknown query parameters, so an endpoint that
    forgets a filter looks like a dead control in the UI rather than an error.
    Sharing this function is what prevents that.
    """
    if pathway:
        want = {p.strip().upper() for p in pathway.split(",") if p.strip()}
        rows = [r for r in rows if r.get("pathway") in want]
    if lifecycle_status:
        rows = [r for r in rows if r["lifecycle_status"] == lifecycle_status]
    if zone:
        rows = [r for r in rows if r["zone"] == zone]
    if min_soh is not None:
        rows = [r for r in rows if r["soh_pct"] >= min_soh]
    if max_soh is not None:
        rows = [r for r in rows if r["soh_pct"] <= max_soh]
    if max_eol is not None:
        rows = [
            r for r in rows
            if r["eol_in_months"] is not None and r["eol_in_months"] <= max_eol
        ]
    if anomaly_only:
        rows = [r for r in rows if r["anomaly_status"] == "POTENTIAL_ANOMALY"]
    if confidence_band:
        rows = [r for r in rows if r["confidence_band"] == confidence_band]
    if search:
        q = search.strip().lower()
        rows = [
            r for r in rows
            if q in r["battery_id"].lower() or q in (r.get("vehicle_id") or "").lower()
        ]

    key = {
        "soh": lambda r: r["soh_pct"],
        "eol": lambda r: r["eol_in_months"] if r["eol_in_months"] is not None else 1e9,
        "battery_id": lambda r: r["battery_id"],
        "risk": lambda r: r.get("pathway") == "EOL_CANDIDATE",
    }.get(sort_by, lambda r: r["soh_pct"])
    rows.sort(key=key, reverse=(order.lower() == "desc"))
    return rows


def _filter_params(
    pathway: str | None = Query(None, description="Comma-separated pathway names"),
    lifecycle_status: str | None = Query(None),
    zone: str | None = Query(None),
    min_soh: float | None = Query(None),
    max_soh: float | None = Query(None),
    max_eol: float | None = Query(None, description="Only EOL horizon <= this many months"),
    anomaly_only: bool = Query(False),
    confidence_band: str | None = Query(None, description="High | Moderate | Low"),
    search: str | None = Query(None),
    sort_by: str = Query("soh", description="soh | eol | risk | battery_id"),
    order: str = Query("asc", description="asc | desc"),
) -> dict[str, Any]:
    """Collect the shared filter query parameters into one dict."""
    return {
        "pathway": pathway, "lifecycle_status": lifecycle_status, "zone": zone,
        "min_soh": min_soh, "max_soh": max_soh, "max_eol": max_eol,
        "anomaly_only": anomaly_only, "confidence_band": confidence_band,
        "search": search, "sort_by": sort_by, "order": order,
    }


@router.get("/fleet/vehicles")
def fleet_vehicles(
    db: Session = Depends(get_db),
    f: dict[str, Any] = Depends(_filter_params),
) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    rows = _apply_filters(_join_pathways(b), **f)
    return {
        "count": len(rows),
        "total_in_dataset": len(b["records"]),
        "filters_applied": f,
        "provenance": _provenance(db),
        "batteries": rows,
    }


@router.get("/vehicles/{vehicle_id}")
def vehicle_detail(vehicle_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()
    if vehicle is None:
        raise _unknown_vehicle(vehicle_id)
    b = _baseline(db)
    rows = _vehicle_records(b, vehicle_id)
    dec = {d["battery_id"]: d for d in b["decisions"]}
    return {
        "vehicle": {
            "vehicle_id": vehicle.vehicle_id,
            "model_name": vehicle.model_name,
            "zone": vehicle.zone,
            "latitude": vehicle.latitude,
            "longitude": vehicle.longitude,
            "priority": vehicle.priority,
            "in_service_since": vehicle.in_service_since.isoformat(),
            "distance_travelled_km": vehicle.distance_travelled_km,
        },
        "batteries": [
            {**r, "pathway": dec.get(r["battery_id"], {}).get("pathway"),
             "pathway_label": dec.get(r["battery_id"], {}).get("pathway_label")}
            for r in rows
        ],
        "provenance": _provenance(db),
    }


@router.get("/batteries")
def batteries_list(
    db: Session = Depends(get_db),
    f: dict[str, Any] = Depends(_filter_params),
) -> dict[str, Any]:
    """
    Battery intelligence listing.

    Uses the SAME filter implementation as /api/fleet/vehicles. Previously this
    endpoint accepted only four of the nine filters and silently ignored the
    rest, which made several UI controls appear broken with no error.
    """
    _empty_guard(db)
    b = _baseline(db)
    rows = _apply_filters(_join_pathways(b), **f)
    return {
        "count": len(rows),
        "total_in_dataset": len(b["records"]),
        "filters_applied": f,
        "provenance": _provenance(db),
        "batteries": rows,
    }


@router.get("/batteries/{battery_id}")
def battery_detail(battery_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    rec = next((r for r in b["records"] if r["battery_id"] == battery_id), None)
    if rec is None:
        raise HTTPException(
            status_code=404,
            detail=_unknown_battery(battery_id).detail,
        )
    dec = next(d for d in b["decisions"] if d["battery_id"] == battery_id)
    row = db.query(Battery).filter(Battery.battery_id == battery_id).first()
    timeline = traceability_mod.timeline_for(db, row) if row else None
    return {
        "battery": rec,
        "pathway": dec,
        "lifecycle": timeline,
        "provenance": _provenance(db),
    }


# ---------------------------------------------------------------------------
# Module-scoped endpoints (health / rul / anomaly / lifecycle)
# ---------------------------------------------------------------------------

def _unknown_vehicle(vehicle_id: str) -> HTTPException:
    """A 404 that tells the caller how to find a valid id."""
    return HTTPException(
        status_code=404,
        detail=(
            f"No vehicle '{vehicle_id}'. "
            "Use GET /api/fleet/vehicles to list valid vehicle IDs."
        ),
    )


def _unknown_battery(battery_id: str) -> HTTPException:
    """A 404 that tells the caller how to find a valid id."""
    return HTTPException(
        status_code=404,
        detail=(
            f"No battery '{battery_id}'. "
            "Use GET /api/batteries to list valid battery IDs."
        ),
    )


def _vehicle_records(b: dict[str, Any], vehicle_id: str) -> list[dict[str, Any]]:
    rows = [r for r in b["records"] if r["vehicle_id"] == vehicle_id]
    if not rows:
        raise _unknown_vehicle(vehicle_id)
    return rows


@router.get("/vehicles/{vehicle_id}/health")
def vehicle_health(vehicle_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    return {"vehicle_id": vehicle_id, "batteries": _vehicle_records(b, vehicle_id)}


@router.get("/vehicles/{vehicle_id}/rul")
def vehicle_rul(vehicle_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    return {
        "vehicle_id": vehicle_id,
        "batteries": [
            {
                "battery_id": r["battery_id"],
                "estimated_eol_months": r["eol_in_months"],
                "range": r["eol_range"],
                "note": r["eol_estimate_note"],
                "estimate": True,
            }
            for r in _vehicle_records(b, vehicle_id)
        ],
    }


@router.get("/vehicles/{vehicle_id}/anomaly")
def vehicle_anomaly(vehicle_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    return {
        "vehicle_id": vehicle_id,
        "batteries": [
            {
                "battery_id": r["battery_id"],
                "anomaly_score": r["anomaly_score"],
                "anomaly_status": r["anomaly_status"],
                "wording": r["anomaly_wording"],
                "evidence": r.get("anomaly_evidence"),
            }
            for r in _vehicle_records(b, vehicle_id)
        ],
    }


@router.get("/vehicles/{vehicle_id}/lifecycle")
def vehicle_lifecycle(vehicle_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    battery = (
        db.query(Battery).join(Vehicle, Battery.vehicle_id == Vehicle.id)
        .filter(Vehicle.vehicle_id == vehicle_id).first()
    )
    if battery is None:
        raise _unknown_vehicle(vehicle_id)
    return traceability_mod.timeline_for(db, battery)


@router.get("/batteries/{battery_id}/lifecycle")
def battery_lifecycle(battery_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    battery = db.query(Battery).filter(Battery.battery_id == battery_id).first()
    if battery is None:
        raise _unknown_battery(battery_id)
    return traceability_mod.timeline_for(db, battery)


# ---------------------------------------------------------------------------
# Module 3 - forecast
# ---------------------------------------------------------------------------

@router.get("/waste/forecast")
def waste_forecast(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["forecast"], "provenance": _provenance(db)}


# ---------------------------------------------------------------------------
# Module 5 - avoidance ledger
# ---------------------------------------------------------------------------

@router.get("/waste/avoidance")
def waste_avoidance(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["ledger"], "provenance": _provenance(db)}


# ---------------------------------------------------------------------------
# Module 4 - prevention decision for one battery
# ---------------------------------------------------------------------------

@router.post("/waste/prevention")
def waste_prevention(payload: dict[str, Any] | None = None,
                     db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    payload = payload or {}

    if payload.get("battery_id"):
        dec = next(
            (d for d in b["decisions"] if d["battery_id"] == payload["battery_id"]), None
        )
        if dec is None:
            raise _unknown_battery(str(payload["battery_id"]))
        return {"decision": dec, "fleet_ledger": b["ledger"]}

    return {
        "fleet": [
            {
                "battery_id": d["battery_id"], "vehicle_id": d["vehicle_id"],
                "zone": d["zone"], "soh_pct": d["soh_pct"],
                "pathway": d["pathway"], "pathway_label": d["pathway_label"],
                "wording": d["wording"],
                "rules_fired": [r["rule"] for r in d["rules_fired"]],
                "potential_avoided_units": d["potential_avoided_units"],
                "requires_technical_assessment": d["requires_technical_assessment"],
            }
            for d in b["decisions"]
        ],
        "ledger": b["ledger"],
        "prevention_principle": (
            "A degraded battery is not automatically waste. Every battery is routed "
            "through an ordered set of lifecycle pathways before being called EOL."
        ),
    }


@router.post("/waste/intervention/{battery_id}")
def record_intervention(battery_id: str, payload: InterventionDecision,
                        db: Session = Depends(get_db)) -> dict[str, Any]:
    from datetime import datetime, timezone

    from ..database.models import WasteIntervention

    battery = db.query(Battery).filter(Battery.battery_id == battery_id).first()
    if battery is None:
        raise _unknown_battery(battery_id)

    b = _baseline(db)
    dec = next(d for d in b["decisions"] if d["battery_id"] == battery_id)

    intervention = WasteIntervention(
        battery_id=battery.id,
        pathway=payload.pathway,
        rationale=dec["wording"],
        rules_fired=__import__("json").dumps([r["rule"] for r in dec["rules_fired"]]),
        estimated_avoided_units=dec["potential_avoided_units"],
        estimated_cost_inr=dec["estimated_intervention_cost_inr"],
        status="DECIDED",
        decided_by=payload.decided_by,
        decided_at=datetime.now(timezone.utc),
    )
    db.add(intervention)

    battery.second_life_status = (
        "ASSESSED" if payload.pathway == "SECOND_LIFE_ASSESSMENT" else battery.second_life_status
    )
    db.add(
        LifecycleEvent(
            battery_id=battery.id,
            occurred_at=datetime.now(timezone.utc),
            event="INTERVENTION_ASSESSMENT",
            location=battery.vehicle.zone if battery.vehicle else "",
            handler=payload.decided_by,
            status="RECORDED",
            evidence_ref=f"INT-{battery_id}",
        )
    )
    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "recorded",
        "battery_id": battery_id,
        "pathway": payload.pathway,
        "note": (
            "The decision and its rules are now in the lifecycle audit trail. "
            "It does not alter the model's estimate - only the recorded operator decision."
        ),
    }


# ---------------------------------------------------------------------------
# Modules 6 & 7 - collection
# ---------------------------------------------------------------------------

@router.get("/collection/prioritize")
def collection_prioritize(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["queue"], "provenance": _provenance(db)}


@router.post("/collection/batch")
def collection_batch(payload: BatchRequest | None = None,
                     db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    payload = payload or BatchRequest()
    b = _baseline(db)
    out = collection_mod.build_batches(
        b["queue"],
        trip_capacity=payload.trip_capacity_units,
        trips_per_month=payload.trips_per_month,
        max_trips=payload.max_trips,
    )
    return {**out, "provenance": _provenance(db)}


@router.get("/collection/capacity")
def collection_capacity(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["capacity"], "provenance": _provenance(db)}


# ---------------------------------------------------------------------------
# Module 11 - circularity
# ---------------------------------------------------------------------------

@router.get("/circularity/score")
def circularity_score(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["circularity"], "provenance": _provenance(db)}


# ---------------------------------------------------------------------------
# Module 10 - blind spots
# ---------------------------------------------------------------------------

@router.get("/traceability/blind-spots")
def blind_spots(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["blind_spots"], "provenance": _provenance(db)}


@router.get("/traceability/summary")
def traceability_summary(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    counts: dict[str, int] = {}
    for battery in db.query(Battery).all():
        counts[battery.lifecycle_status] = counts.get(battery.lifecycle_status, 0) + 1
    return {
        "lifecycle_counts": counts,
        "circularity": b["circularity"],
        "blind_spots": {
            "total_findings": b["blind_spots"]["total_findings"],
            "affected_batteries": b["blind_spots"]["affected_batteries"],
            "by_category": b["blind_spots"]["by_category"],
        },
        "events": db.query(LifecycleEvent).count(),
        "provenance": _provenance(db),
    }


# ---------------------------------------------------------------------------
# Modules 12 & 13 - simulator / digital twin
# ---------------------------------------------------------------------------

@router.post("/simulator/run")
def simulator_run(payload: SimulateRequest | None = None,
                  db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    payload = payload or SimulateRequest()
    b = _baseline(db)
    try:
        out = simulator.run_simulation(db, b, payload.model_dump(exclude_none=True))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {**out, "provenance": _provenance(db)}


@router.get("/simulator/scenarios")
def simulator_scenarios() -> dict[str, Any]:
    return {"scenarios": simulator.preset_scenarios()}


@router.get("/digital-twin/baseline")
def twin_baseline(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    return {
        "results": b["results"],
        "monthly_forecast": b["forecast"]["monthly_forecast"],
        "pathway_counts": b["ledger"]["counts"],
        "scenarios": simulator.preset_scenarios(),
        "provenance": _provenance(db),
    }


# ---------------------------------------------------------------------------
# Module 14 - action plan
# ---------------------------------------------------------------------------

@router.get("/action-plan")
def action_plan(db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    return {**_baseline(db)["action_plan"], "provenance": _provenance(db)}


# ---------------------------------------------------------------------------
# Module 15 - GenAI explanation
# ---------------------------------------------------------------------------

@router.post("/reports/explain")
def reports_explain(payload: ExplainRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    _empty_guard(db)
    b = _baseline(db)
    rec = next((r for r in b["records"] if r["battery_id"] == payload.battery_id), None)
    if rec is None:
        raise _unknown_battery(payload.battery_id)
    dec = next(d for d in b["decisions"] if d["battery_id"] == payload.battery_id)

    extras: dict[str, Any] = {}
    if rec["battery_id"] in {t["battery_id"] for t in b["queue"]["queue"]}:
        q = next(
            t for t in b["queue"]["queue"] if t["battery_id"] == rec["battery_id"]
        )
        extras["collection_priority_score"] = q["priority_score"]
        extras["collection_priority_band"] = q["priority_band"]
        extras["collection_days_to_deadline"] = q["days_to_deadline"]

    facts = genai.build_facts(rec, dec, extras)
    return genai.explain(facts, allow_external=payload.allow_external)


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/data/upload")
async def data_upload(file: UploadFile = File(...), db: Session = Depends(get_db)) -> dict[str, Any]:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        df = pd.read_csv(io.BytesIO(raw))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not parse CSV: {type(exc).__name__}: {exc}",
        ) from exc

    required = required_columns()
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "error": "missing required columns",
                "missing": missing,
                "required": required,
                "found": list(df.columns),
                "hint": "GET /api/demo/template.csv returns a correctly shaped file.",
            },
        )
    if len(df) == 0:
        raise HTTPException(status_code=400, detail="CSV contains a header but no data rows.")

    coerced: dict[str, int] = {}
    for c in required:
        if c in ("battery_id", "vehicle_id", "chemistry"):
            continue
        num = pd.to_numeric(df[c], errors="coerce")
        if num.isna().any():
            coerced[c] = int(num.isna().sum())
        df[c] = num
    df = df.dropna(
        subset=[c for c in required if c not in ("battery_id", "vehicle_id", "chemistry")]
    ).reset_index(drop=True)
    if len(df) == 0:
        raise HTTPException(
            status_code=422,
            detail={"error": "every row had unparseable numeric values", "bad_columns": coerced},
        )

    from . import ingest

    result = ingest.replace_dataset(
        db, df, file.filename or "upload.csv", coerced=coerced
    )
    fleet_mod.invalidate()
    return result


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@router.get("/reports/fleet.csv")
def export_fleet(
    pathway: str | None = Query(None),
    anomaly_only: bool = Query(False),
) -> Response:
    db: Session = next(get_db())
    try:
        _empty_guard(db)
        b = _baseline(db)
        dec = {d["battery_id"]: d for d in b["decisions"]}
        rows = b["records"]
        if pathway:
            want = {p.strip().upper() for p in pathway.split(",") if p.strip()}
            rows = [r for r in rows if dec.get(r["battery_id"], {}).get("pathway") in want]
        if anomaly_only:
            rows = [r for r in rows if r["anomaly_status"] == "POTENTIAL_ANOMALY"]

        prov = _provenance(db)
        cols = [
            "DATA_PROVENANCE", "battery_id", "battery_lifecycle_id", "vehicle_id", "zone",
            "chemistry", "soh_pct", "soh_estimate_low_pct", "soh_estimate_high_pct",
            "estimated_eol_months", "eol_threshold_soh_pct", "trend_direction",
            "anomaly_score", "anomaly_status", "data_confidence", "confidence_band",
            "pathway", "rules_fired", "potential_avoided_units", "lifecycle_status",
            "collection_status", "second_life_status", "recycling_status",
        ]
        out = pd.DataFrame(
            [
                {
                    "DATA_PROVENANCE": prov["label"],
                    "battery_id": r["battery_id"],
                    "battery_lifecycle_id": r["battery_uid"],
                    "vehicle_id": r["vehicle_id"],
                    "zone": r["zone"],
                    "chemistry": r["chemistry"],
                    "soh_pct": r["soh_pct"],
                    "soh_estimate_low_pct": r["soh_low_pct"],
                    "soh_estimate_high_pct": r["soh_high_pct"],
                    "estimated_eol_months": r["eol_in_months"],
                    "eol_threshold_soh_pct": r["eol_threshold_soh_pct"],
                    "trend_direction": (r.get("trend") or {}).get("trend_direction"),
                    "anomaly_score": r["anomaly_score"],
                    "anomaly_status": r["anomaly_status"],
                    "data_confidence": r["data_confidence"],
                    "confidence_band": r["confidence_band"],
                    "pathway": dec.get(r["battery_id"], {}).get("pathway"),
                    "rules_fired": "|".join(
                        x["rule"] for x in dec.get(r["battery_id"], {}).get("rules_fired", [])
                    ),
                    "potential_avoided_units": dec.get(r["battery_id"], {}).get(
                        "potential_avoided_units", 0.0
                    ),
                    "lifecycle_status": r["lifecycle_status"],
                    "collection_status": r["collection_status"],
                    "second_life_status": r["second_life_status"],
                    "recycling_status": r["recycling_status"],
                }
                for r in rows
            ],
            columns=cols,
        )
        csv = out.to_csv(index=False).encode("utf-8")
        suffix = "SYNTHETIC" if prov["simulated"] else "UPLOADED"
        return Response(
            content=csv,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="evolve_fleet_{suffix}.csv"'
            },
        )
    finally:
        db.close()