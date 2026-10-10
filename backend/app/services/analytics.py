"""
Analytics orchestrator.

`build_baseline()` runs every module once and returns the bundle the API serves.
Composing here (rather than in the routes) keeps the endpoint layer thin and
guarantees the dashboard, the digital twin and the simulator all compare against
exactly the same baseline numbers.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from . import (
    action_plan,
    capacity as capacity_mod,
    circularity as circularity_mod,
    collection as collection_mod,
    fleet as fleet_mod,
    forecasting as forecasting_mod,
    prevention as prevention_mod,
    quality as quality_mod,
    traceability as traceability_mod,
)


def build_baseline(db: Session, force: bool = False) -> dict[str, Any]:
    """Run the full analysis stack over the active dataset."""
    records, _ = fleet_mod.load_records(db, force=force)

    decisions = [prevention_mod.decide_pathway(r) for r in records]
    ledger = prevention_mod.build_ledger(decisions)
    forecast = forecasting_mod.forecast_from_records(records)
    queue = collection_mod.build_queue(decisions, records)
    batches = collection_mod.build_batches(queue)
    capacity = capacity_mod.capacity_plan(db, forecast, decisions, records)
    blind_spots = traceability_mod.detect_blind_spots(db, records, decisions)
    circularity = circularity_mod.compute(db, records, decisions)

    quality_assessments = [
        quality_mod.assess_quality(
            history_months=r.get("history_months", 0),
            reading_count=r.get("reading_count", 0),
            missing_count=r.get("missing_reading_count", 0),
            duplicate_count=r.get("duplicate_record_count", 0),
            invalid_count=r.get("invalid_range_count", 0),
            outlier_count=r.get("outlier_count", 0),
        )
        for r in records
    ]
    quality_summary = quality_mod.fleet_quality_summary(quality_assessments)

    plan = action_plan.build_action_plan(
        records, decisions, forecast, queue, batches, capacity, blind_spots, circularity
    )

    summary = _summary(records, decisions, forecast, ledger, capacity, blind_spots, circularity)

    results = {
        "total_batteries": len(records),
        "potential_eol_3_months": forecast["headline"]["potential_eol_3_months"],
        "potential_eol_6_months": forecast["headline"]["potential_eol_6_months"],
        "potential_eol_12_months": forecast["headline"]["potential_eol_12_months"],
        "eol_candidates": ledger["counts"]["eol_candidate"],
        "retained_batteries": ledger["retained_batteries"],
        "intervention_candidates": ledger["potential_intervention_candidates"],
        "potential_waste_avoided_units": ledger["potential_eol_waste_avoided_units"],
        "potential_waste_avoided_kg": ledger["potential_eol_waste_avoided_kg"],
        "second_life_candidates": ledger["counts"]["second_life_assessment"],
        "repair_candidates": ledger["counts"]["repair_refurbishment"],
        "collection_pending": sum(
            1 for r in records
            if r["lifecycle_status"] == "IN_SERVICE" and r["soh_pct"] < 80
        ),
        "recycling_processing_load": round(
            forecast["peak_month"]["expected_eol"] if forecast["peak_month"] else 0.0, 1
        ),
        "anomaly_candidates": sum(
            1 for r in records if r["anomaly_status"] == "POTENTIAL_ANOMALY"
        ),
        "blind_spot_findings": blind_spots["total_findings"],
        "collection_batches": batches["total_batches"],
        "collection_distance_km": batches["total_distance_km"],
        "collection_cost_inr": batches["total_estimated_cost_inr"],
        "collection_units_scheduled": batches["total_units"],
        "collection_trips_used": batches["total_batches"],
        "unscheduled_collection_units": batches["unscheduled_count"],
        "peak_monthly_inflow": forecast["peak_month"]["expected_eol"] if forecast["peak_month"] else 0.0,
        # Canonical name shared by the digital twin, the simulator and the
        # dashboard, so all three compare against one figure.
        "circularity_score": circularity["overall_score"],
        "estimated_operational_cost_inr": round(
            batches["total_estimated_cost_inr"]
            + ledger["estimated_intervention_cost_inr"], 2
        ),
    }

    return {
        "records": records,
        "decisions": decisions,
        "summary": summary,
        "quality_summary": quality_summary,
        "ledger": ledger,
        "forecast": forecast,
        "queue": queue,
        "batches": batches,
        "capacity": capacity,
        "blind_spots": blind_spots,
        "circularity": circularity,
        "action_plan": plan,
        "results": results,
    }


def _summary(
    records: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    forecast: dict[str, Any],
    ledger: dict[str, Any],
    capacity: dict[str, Any],
    blind_spots: dict[str, Any],
    circularity: dict[str, Any],
) -> dict[str, Any]:
    """Dashboard KPI block. Every figure computed, none hardcoded."""
    by_pathway: dict[str, int] = {}
    for d in decisions:
        by_pathway[d["pathway"]] = by_pathway.get(d["pathway"], 0) + 1

    collection_pending = sum(
        1 for r in records
        if r["lifecycle_status"] == "IN_SERVICE" and r["soh_pct"] < 80
    )
    second_life = ledger["counts"]["second_life_assessment"]
    recycling_load = forecast["peak_month"]["expected_eol"] if forecast["peak_month"] else 0.0

    lifecycle_counts: dict[str, int] = {}
    for r in records:
        lifecycle_counts[r["lifecycle_status"]] = (
            lifecycle_counts.get(r["lifecycle_status"], 0) + 1
        )

    return {
        "total_batteries": len(records),
        "potential_eol_3_months": forecast["headline"]["potential_eol_3_months"],
        "potential_eol_6_months": forecast["headline"]["potential_eol_6_months"],
        "potential_eol_12_months": forecast["headline"]["potential_eol_12_months"],
        "intervention_candidates": ledger["potential_intervention_candidates"],
        "collection_pending": collection_pending,
        "second_life_candidates": second_life,
        "recycling_processing_load": round(recycling_load, 1),
        "circularity_score": circularity["overall_score"],
        "pathway_counts": by_pathway,
        "lifecycle_counts": lifecycle_counts,
        "eol_candidates": ledger["counts"]["eol_candidate"],
        "anomaly_candidates": sum(
            1 for r in records if r["anomaly_status"] == "POTENTIAL_ANOMALY"
        ),
        "capacity_status": capacity["status"],
        "blind_spot_findings": blind_spots["total_findings"],
        "affected_by_blind_spots": blind_spots["affected_batteries"],
        "mean_data_confidence": round(
            sum(r["data_confidence"] for r in records) / len(records), 1
        ) if records else 0.0,
    }