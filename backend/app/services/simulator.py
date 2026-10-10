"""
Modules 12 & 13 - Waste Reduction What-If Simulator and Fleet Digital Twin.

One engine serves both. The twin re-runs the SAME pipeline over a SYNTHETIC
scaled copy of the fleet, using the same models and the same rules, then reports
the delta against the current state. Nothing is modelled twice and nothing is
invented: if a parameter does not affect an output, the output does not move.

How scaling works (stated, because it determines the numbers):
  * fleet_scale multiplies the number of batteries and their duty-cycle spread;
  * repair_capacity / second_life_capacity are absolute unit ceilings per month
    and therefore bind when the EOL population exceeds them;
  * recycling_capacity / collection_capacity are compared against peak inflow.
"""

from __future__ import annotations

import json
from typing import Any

import numpy as np

from .. import config
from ..database.models import ProcessingHandler
from . import capacity as capacity_mod
from . import collection as collection_mod
from . import circularity as circularity_mod
from . import forecasting as forecasting_mod
from . import prevention as prevention_mod

#: Cap on scaled batteries so the simulator cannot be used as a compute DoS.
MAX_SIMULATED_BATTERIES = 4000


def _scaling_view(r: dict[str, Any]) -> dict[str, Any]:
    """
    Map an analysed record onto the field names the model frame expects.

    `load_records` produces model-facing names (history_months,
    charging_cycles) whereas `make_feature_frame` consumes spec names
    (months_in_service, equivalent_full_cycles). This adapter is the single
    place that bridges the two, so neither layer has to know about the other.
    """
    return {
        "battery_id": r["battery_id"],
        "vehicle_id": r.get("vehicle_id"),
        "zone": r.get("zone"),
        "months_in_service": float(r.get("history_months") or r.get("months_in_service") or 12),
        "equivalent_full_cycles": float(r.get("charging_cycles") or 300),
        "daily_km": float(r.get("daily_km") or 60),
        "fast_charge_ratio": float(r.get("fast_charge_ratio") or 0.3),
        "rated_capacity_kwh": float(r.get("rated_capacity_kwh") or 50),
        "energy_per_km": r.get("energy_per_km"),
        # Throughput is carried verbatim so replaying an unjittered record
        # reproduces the baseline prediction exactly.
        "energy_throughput_kwh": r.get("energy_throughput_kwh"),
        "temperature": r.get("temperature") or {},
        "soh_pct": float(r.get("soh_pct") or 80.0),
        "soh_low_pct": float(r.get("soh_low_pct") or 78.0),
        "soh_high_pct": float(r.get("soh_high_pct") or 82.0),
        "eol_in_months": r.get("eol_in_months"),
        "already_below_eol_threshold": bool(r.get("already_below_eol_threshold")),
        "anomaly_score": float(r.get("anomaly_score") or 0.0),
        "data_confidence": float(r.get("data_confidence") or 50.0),
        "confidence_band": r.get("confidence_band") or "Moderate",
        "battery_age_months": int(r.get("battery_age_months") or 36),
        "trend": r.get("trend") or {},
        "anomaly_kind": r.get("anomaly_kind"),
        "latitude": r.get("latitude"),
        "longitude": r.get("longitude"),
        "fleet_priority": r.get("fleet_priority") or "Standard",
        "chemistry": r.get("chemistry"),
        "data_source": r.get("data_source"),
        "lifecycle_status": r.get("lifecycle_status") or "IN_SERVICE",
        "history_months": r.get("history_months"),
        # The exact feature vector used for the baseline prediction. Carried
        # through so a no-op scenario reproduces the baseline bit-for-bit.
        "model_features": dict(r.get("model_features") or {}),
        # Lift the two fields the feature frame needs from the stored vector.
        "energy_throughput_kwh": (r.get("model_features") or {}).get(
            "energy_throughput_kwh"
        ),
    }


def _scale_records(records: list[dict[str, Any]], factor: float,
                   rng: np.random.Generator) -> list[dict[str, Any]]:
    """
    Produce a synthetic scaled fleet by resampling existing battery profiles.

    New batteries clone a randomly chosen real profile with jittered duty cycle,
    which keeps the simulation anchored to the measured spread instead of a
    made-up distribution.
    """
    n_target = int(min(len(records) * factor, MAX_SIMULATED_BATTERIES))
    out: list[dict[str, Any]] = []
    for i in range(n_target):
        src = dict(records[i % len(records)])
        jitter = float(rng.normal(1.0, 0.12))
        warm_jitter = float(rng.normal(1.0, 0.10))
        src["battery_id"] = f"SIM-{i:05d}"
        src["vehicle_id"] = f"SIMV-{i:05d}"
        src["battery_row_id"] = None
        # Jitter the underlying FEATURE VECTOR, not the derived display fields,
        # so the models see a genuinely different duty cycle.
        mf = dict(src["model_features"])
        mf["equivalent_full_cycles"] = max(mf["equivalent_full_cycles"] * max(jitter, 0.4), 1.0)
        mf["months_in_service"] = max(mf["months_in_service"] * max(warm_jitter, 0.3), 1.0)
        mf["daily_km"] = max(mf["daily_km"] * max(jitter, 0.4), 1.0)
        # Throughput is a function of the other three, so it must be rescaled
        # with them or the model would see an inconsistent duty cycle.
        mf["energy_throughput_kwh"] = (
            mf["energy_throughput_kwh"] * max(jitter, 0.4) * max(warm_jitter, 0.3)
        )
        src["model_features"] = mf
        out.append(src)
    return out


def run_simulation(
    db,
    baseline: dict[str, Any],
    params: dict[str, Any],
) -> dict[str, Any]:
    """
    Run a what-if scenario.

    `baseline` is the bundle returned by `build_baseline()`.
    `params` accepts: fleet_scale, repair_capacity, second_life_capacity,
    recycling_capacity, collection_capacity, collection_trips, intervention_rate.
    """
    from ..ml.trainer import ModelBundle, make_feature_frame

    rng = np.random.default_rng(config.RANDOM_SEED + 31)
    bundle = ModelBundle()
    if not bundle.ready:
        raise RuntimeError("models are not trained")

    # Analysed records use model-facing names (history_months, charging_cycles)
    # rather than the raw spec names the scaler expects, so map them explicitly
    # rather than relying on field names that differ between the two layers.
    records = [_scaling_view(r) for r in baseline["records"]]

    fleet_scale = float(params.get("fleet_scale", 1.0))
    intervention_rate = float(params.get("intervention_rate", 1.0))
    repair_cap = params.get("repair_capacity")
    second_cap = params.get("second_life_capacity")
    recycling_cap = params.get("recycling_capacity")
    collection_cap = params.get("collection_capacity")
    trips = params.get("collection_trips")

    sim_records = (
        _scale_records(records, fleet_scale, rng) if abs(fleet_scale - 1.0) > 1e-9
        else list(records)
    )

    # Re-run the models on the simulated fleet using the SAME feature vectors
    # that produced the baseline, jittered only where the fleet was scaled. With
    # no scaling this is bit-identical to the baseline input, which is what
    # guarantees a no-op scenario produces no change.
    frame_rows = []
    for r in sim_records:
        row = dict(r["model_features"])
        frame_rows.append({"battery_id": r["battery_id"], **row})
    frame = make_feature_frame(frame_rows)
    preds = bundle.predict(frame)

    sim: list[dict[str, Any]] = []
    for i, r in enumerate(sim_records):
        rec = dict(r)
        rec["soh_pct"] = round(float(preds["soh"][i]) * 100, 2)
        rec["soh_low_pct"] = round(float(preds["soh_low"][i]) * 100, 2)
        rec["soh_high_pct"] = round(float(preds["soh_high"][i]) * 100, 2)
        eol = float(preds["eol"][i])
        rec["eol_in_months"] = round(eol, 1)
        rec["already_below_eol_threshold"] = bool(
            float(preds["soh"][i]) < config.EOL_SOH_THRESHOLD
        )
        rec["anomaly_score"] = round(float(preds["anomaly"][i]), 4)
        rec["history_months"] = rec.get("months_in_service", 12)
        rec["battery_age_months"] = rec.get("months_in_service", 12)
        rec["temperature"] = rec.get("temperature") or {
            "current_c": 34, "peak_c": 44, "history_max_c": 46
        }
        sim.append(rec)

    decisions = [prevention_mod.decide_pathway(r) for r in sim]

    # Apply capacity ceilings + intervention rate to the pathways.
    decisions = _apply_capacity(decisions, repair_cap, second_cap, intervention_rate)

    forecast = forecasting_mod.forecast_from_records(sim)
    ledger = prevention_mod.build_ledger(decisions)

    queue = collection_mod.build_queue(decisions, sim)
    batches = collection_mod.build_batches(
        queue,
        trip_capacity=int(params.get("trip_capacity_units", config.DEFAULT_TRIP_CAPACITY_UNITS)),
        trips_per_month=int(trips or config.DEFAULT_COLLECTION_TRIPS_PER_MONTH),
    )

    # Circularity for a simulated fleet is estimated from pathway mix rather
    # than database rows (which describe the real fleet only). Stated as such.
    circ_estimate = _estimate_circularity(decisions, forecast)

    results = {
        "batteries_simulated": len(sim),
        "fleet_scale": round(fleet_scale, 3),
        "intervention_rate": round(intervention_rate, 3),
        "potential_eol_3_months": forecast["headline"]["potential_eol_3_months"],
        "potential_eol_6_months": forecast["headline"]["potential_eol_6_months"],
        "potential_eol_12_months": forecast["headline"]["potential_eol_12_months"],
        "eol_candidates": ledger["counts"]["eol_candidate"],
        "retained_batteries": ledger["retained_batteries"],
        "intervention_candidates": ledger["potential_intervention_candidates"],
        "potential_waste_avoided_units": ledger["potential_eol_waste_avoided_units"],
        "potential_waste_avoided_kg": ledger["potential_eol_waste_avoided_kg"],
        "collection_batches": batches["total_batches"],
        "collection_distance_km": batches["total_distance_km"],
        "collection_cost_inr": batches["total_estimated_cost_inr"],
        "collection_trips_used": batches["total_batches"],
        "collection_units_scheduled": batches["total_units"],
        "unscheduled_collection_units": batches["unscheduled_count"],
        "peak_monthly_inflow": forecast["peak_month"]["expected_eol"] if forecast["peak_month"] else 0.0,
        # Key must match the baseline's canonical name, or the delta for circularity
        # silently disappears.
        "circularity_score": circ_estimate,
        "estimated_operational_cost_inr": round(
            batches["total_estimated_cost_inr"]
            + sum(d["estimated_intervention_cost_inr"] for d in decisions if d["actionable"]),
            2,
        ),
    }

    base = baseline["results"]
    delta = {}
    for k, v in results.items():
        if k in ("batteries_simulated", "fleet_scale", "intervention_rate"):
            continue
        b = base.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and isinstance(b, (int, float)):
            delta[k] = {
                "baseline": b,
                "scenario": v,
                "change": round(v - b, 2),
                "change_pct": round((v - b) / b * 100, 1) if b else None,
            }

    return {
        "params": params,
        "results": results,
        "baseline": base,
        "delta": delta,
        "monthly_forecast": forecast["monthly_forecast"],
        "by_zone": forecast["by_zone"],
        "pathway_counts": ledger["counts"],
        "batches": batches["batches"][:12],
        "capacity": _sim_capacity(db, forecast, recycling_cap, collection_cap, trips),
        "method": (
            "The simulated fleet is built by resampling existing battery profiles with "
            "jittered duty cycles, then pushed through the SAME models and the SAME rules "
            "as the current fleet. Capacity ceilings then bind the intervention pathways."
        ),
        "limitations": [
            "Simulated batteries are resampled profiles, not independently observed assets.",
            "Circularity in a scenario is estimated from pathway mix, not from database records.",
            "Capacity ceilings apply per month and bind once the EOL population exceeds them.",
        ],
    }


def _apply_capacity(
    decisions: list[dict[str, Any]],
    repair_cap: float | None,
    second_cap: float | None,
    intervention_rate: float,
) -> list[dict[str, Any]]:
    """
    Bind intervention pathways to available capacity.

    Repair and second-life slots are allocated by severity (worst first), so a
    constrained repair capacity correctly pushes marginal packs to EOL rather
    than silently keeping all of them in repair.
    """
    out = [dict(d) for d in decisions]

    # Intervention rate scales how many candidates are actually actioned.
    if abs(intervention_rate - 1.0) > 1e-9:
        n_target = int(len(out) * intervention_rate)
        actionable = sorted(
            [d for d in out if d["actionable"]],
            key=lambda d: d["soh_pct"],
        )
        keep = {id(d) for d in actionable[:n_target]}
        for d in out:
            if d["actionable"] and id(d) not in keep:
                d["pathway"] = prevention_mod.EOL_CANDIDATE
                d["pathway_label"] = prevention_mod.PATHWAY_LABELS[prevention_mod.EOL_CANDIDATE]
                d["rules_fired"] = (d["rules_fired"] or []) + [{
                    "rule": "R13_INTERVENTION_RATE_LIMIT",
                    "statement": (
                        f"Intervention rate set to {intervention_rate:.0%}, so this "
                        "candidate's prevention pathway was not funded this period."
                    ),
                    "evidence": {"intervention_rate": intervention_rate},
                }]
                d["actionable"] = True
                d["potential_avoided_units"] = 0.0
                d["potential_avoided_waste_kg"] = 0.0

    for pathway, cap in (
        (prevention_mod.REPAIR_REFURBISHMENT, repair_cap),
        (prevention_mod.SECOND_LIFE_ASSESSMENT, second_cap),
    ):
        if cap is None:
            continue
        cap_i = int(cap)
        cands = sorted(
            [d for d in out if d["pathway"] == pathway], key=lambda d: d["soh_pct"]
        )
        overflow = cands[cap_i:]
        for d in overflow:
            d["pathway"] = prevention_mod.EOL_CANDIDATE
            d["pathway_label"] = prevention_mod.PATHWAY_LABELS[prevention_mod.EOL_CANDIDATE]
            d["rules_fired"] = (d["rules_fired"] or []) + [{
                "rule": f"R14_{pathway}_CAPACITY",
                "statement": (
                    f"{pathway.replace('_', ' ').title()} capacity is {cap_i} units per "
                    "period. This candidate exceeded the available slots and falls back "
                    "to EOL collection."
                ),
                "evidence": {"capacity_units": cap_i},
            }]
            d["potential_avoided_units"] = 0.0
            d["potential_avoided_waste_kg"] = 0.0
            d["estimated_intervention_cost_inr"] = prevention_mod.UNIT_COSTS_INR["eol_collection"]

    return out


def _estimate_circularity(decisions: list[dict[str, Any]], forecast: dict[str, Any]) -> float:
    """
    Scenario circularity from pathway mix.

    Kept deliberately simple and stated in the response, because it cannot use
    database traceability rows for batteries that do not exist.
    """
    n = len(decisions)
    if not n:
        return 0.0
    eol = sum(1 for d in decisions if d["pathway"] == prevention_mod.EOL_CANDIDATE)
    sl = sum(1 for d in decisions if d["pathway"] == prevention_mod.SECOND_LIFE_ASSESSMENT)
    sl_or_repair = sum(
        1 for d in decisions
        if d["pathway"] in (
            prevention_mod.SECOND_LIFE_ASSESSMENT,
            prevention_mod.REPAIR_REFURBISHMENT,
        )
    )
    retained = n - eol
    scores = {
        # Traceability and collection coverage are process metrics, not fleet
        # metrics, so they are held at a stated nominal value in scenarios.
        "traceability": 85.0,
        "waste_prevention": retained / n * 100,
        "eol_collection_coverage": 90.0,
        "second_life_assessment_coverage": (sl / max(sl_or_repair, 1)) * 100,
        "recycling_tracking": 78.0,
    }
    return round(
        sum(scores[k] * circularity_mod.CIRCULARITY_WEIGHTS[k] for k in scores), 1
    )


def _sim_capacity(db, forecast, recycling_cap, collection_cap, trips) -> dict[str, Any]:
    # `db` is a Session, so query through it rather than through the model class.
    handlers = db.query(ProcessingHandler).filter(ProcessingHandler.active.is_(True)).all()
    default_proc = sum(h.monthly_capacity_units for h in handlers if h.kind == "RECYCLER")
    proc = recycling_cap if recycling_cap is not None else default_proc
    peak = forecast["peak_month"]["expected_eol"] if forecast["peak_month"] else 0.0
    coll = collection_cap if collection_cap is not None else config.DEFAULT_COLLECTION_CAPACITY_PER_MONTH
    gap = round(max(peak - proc, 0.0), 2)
    return {
        "processing_capacity_units_per_month": proc,
        "collection_capacity_units_per_month": coll,
        "collection_trips_per_month": trips or config.DEFAULT_COLLECTION_TRIPS_PER_MONTH,
        "peak_monthly_inflow": round(peak, 2),
        "processing_gap_units": gap,
        "status": (
            "CAPACITY_MISMATCH" if gap > 0 else
            "CAPACITY_SUFFICIENT" if peak else "NO_FORECAST_INFLOW"
        ),
    }


def preset_scenarios() -> list[dict[str, Any]]:
    """Named scenarios for the Digital Twin page buttons."""
    return [
        {
            "id": "baseline",
            "label": "Current state",
            "question": "Where are we today?",
            "params": {"fleet_scale": 1.0, "intervention_rate": 1.0},
        },
        {
            "id": "fleet_growth_30",
            "label": "Fleet grows 30%",
            "question": "What if fleet size increases by 30%?",
            "params": {"fleet_scale": 1.3, "intervention_rate": 1.0},
        },
        {
            "id": "repair_up_20",
            "label": "Repair capacity +20%",
            "question": "What if repair/refurbishment capacity increases by 20%?",
            "params": {"fleet_scale": 1.0, "intervention_rate": 1.0, "repair_capacity": 18},
        },
        {
            "id": "recycling_down_20",
            "label": "Recycling capacity -20%",
            "question": "What if recycling capacity decreases by 20%?",
            "params": {"fleet_scale": 1.0, "intervention_rate": 1.0, "recycling_capacity": 24},
        },
        {
            "id": "collection_up",
            "label": "Collection capacity +50%",
            "question": "What if collection capacity increases by 50%?",
            "params": {"fleet_scale": 1.0, "intervention_rate": 1.0, "collection_capacity": 60},
        },
        {
            "id": "second_life_push",
            "label": "More second-life diversion",
            "question": "What if more packs are diverted to second-life assessment?",
            "params": {"fleet_scale": 1.0, "intervention_rate": 1.0, "second_life_capacity": 25},
        },
    ]