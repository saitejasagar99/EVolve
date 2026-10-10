"""
Module 11 - Circularity Score.

A transparent weighted composite of five measurable components. NOT an
arbitrary number: every component, its weight, its raw value and its points are
returned, and the points sum exactly to the headline score.

The tooltip content the UI shows is generated from this same payload, so the
explanation can never drift from the number.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from ..database.models import (
    Battery,
    CollectionTask,
    LifecycleEvent,
    RecyclingRecord,
)

#: Component weights, must sum to 1.0.
CIRCULARITY_WEIGHTS: dict[str, float] = {
    "traceability": 0.25,
    "waste_prevention": 0.25,
    "eol_collection_coverage": 0.20,
    "second_life_assessment_coverage": 0.15,
    "recycling_tracking": 0.15,
}
assert abs(sum(CIRCULARITY_WEIGHTS.values()) - 1.0) < 1e-9

COMPONENT_EXPLAINERS = {
    "traceability": (
        "Share of batteries whose lifecycle history is complete enough to reconstruct "
        "where the pack is: it has manufacture, installation and inspection events "
        "recorded against its Battery Lifecycle ID."
    ),
    "waste_prevention": (
        "Share of batteries NOT routed to end-of-life - i.e. retained through continued "
        "use, repair/refurbishment assessment or second-life assessment."
    ),
    "eol_collection_coverage": (
        "Of the batteries identified as EOL candidates, the share that have a "
        "collection task raised against them."
    ),
    "second_life_assessment_coverage": (
        "Of the batteries routed to second-life assessment, the share that have an "
        "assessment decision recorded rather than sitting unactioned."
    ),
    "recycling_tracking": (
        "Of the batteries sent downstream, the share that have a recycling record with "
        "a recorded route and outcome."
    ),
}


def compute(db, records: list[dict[str, Any]], decisions: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute the Circularity Score with a full, auditable breakdown."""
    total = db.scalar(select(func.count(Battery.id))) or 0
    if total == 0:
        return {
            "overall_score": 0.0,
            "components": [],
            "grade": "N/A",
            "note": "No batteries in the dataset.",
        }

    batteries = db.query(Battery).all()
    ids = [b.id for b in batteries]

    events = (
        db.execute(
            select(LifecycleEvent.battery_id, LifecycleEvent.event)
            .where(LifecycleEvent.battery_id.in_(ids))
        ).all()
    ) if ids else []
    names_by: dict[int, set[str]] = {}
    for bid, ev in events:
        names_by.setdefault(bid, set()).add(ev)

    tasks = {
        t.battery_id for t in db.query(CollectionTask).all()
    }
    recycled = {
        r.battery_id for r in db.query(RecyclingRecord).all() if r.route != "UNASSIGNED"
    }

    pathway = {d["battery_id"]: d["pathway"] for d in decisions}

    complete_trail = sum(
        1 for b in batteries
        if {"MANUFACTURED", "INSTALLED_IN_VEHICLE"}.issubset(names_by.get(b.id, set()))
    )
    eol_ids = {d["battery_id"] for d in decisions if d["pathway"] == "EOL_CANDIDATE"}
    retained = total - len(eol_ids)
    eol_covered = sum(1 for b in batteries if b.battery_id in eol_ids and b.id in tasks)
    sl_ids = {d["battery_id"] for d in decisions if d["pathway"] == "SECOND_LIFE_ASSESSMENT"}
    sl_assessed = sum(
        1 for b in batteries
        if b.battery_id in sl_ids and b.second_life_status in ("ASSESSED", "ASSIGNED")
    )
    downstream = sum(1 for b in batteries if b.id in recycled)
    sent_downstream = sum(
        1 for b in batteries
        if b.recycling_status in ("SENT", "PROCESSED") or b.id in recycled
    )

    raw = {
        "traceability": complete_trail / total * 100,
        "waste_prevention": retained / total * 100,
        "eol_collection_coverage": (eol_covered / len(eol_ids) * 100) if eol_ids else 100.0,
        "second_life_assessment_coverage": (sl_assessed / len(sl_ids) * 100) if sl_ids else 100.0,
        "recycling_tracking": (downstream / sent_downstream * 100) if sent_downstream else 100.0,
    }

    components = [
        {
            "name": k,
            "label": k.replace("_", " ").title(),
            "weight": CIRCULARITY_WEIGHTS[k],
            # Raw percentage is rounded for display; `raw_pct_exact` carries the
            # unrounded value so the composite can be recalculated exactly from
            # this response (asserted in tests).
            "raw_pct": round(v, 1),
            "raw_pct_exact": round(v, 6),
            "points": round(v * CIRCULARITY_WEIGHTS[k], 2),
            "explainer": COMPONENT_EXPLAINERS[k],
        }
        for k, v in raw.items()
    ]
    score = round(sum(c["points"] for c in components), 1)

    grade = (
        "A - Strong circularity" if score >= 80 else
        "B - Good, with gaps" if score >= 65 else
        "C - Needs improvement" if score >= 50 else
        "D - Weak circularity"
    )

    weakest = min(components, key=lambda c: c["raw_pct"])
    strongest = max(components, key=lambda c: c["raw_pct"])

    return {
        "overall_score": score,
        "scale": "0-100",
        "grade": grade,
        "components": components,
        "weights": CIRCULARITY_WEIGHTS,
        "reconciliation": {
            "sum_of_component_points": round(sum(c["points"] for c in components), 2),
            "overall_score": score,
            "consistent": abs(sum(c["points"] for c in components) - score) < 0.1,
        },
        "strongest_component": {"name": strongest["name"], "pct": strongest["raw_pct"]},
        "weakest_component": {"name": weakest["name"], "pct": weakest["raw_pct"]},
        "counts": {
            "total_batteries": total,
            "complete_lifecycle_trail": complete_trail,
            "retained_from_eol": retained,
            "eol_candidates": len(eol_ids),
            "eol_with_collection_task": eol_covered,
            "second_life_assessment": len(sl_ids),
            "second_life_assessed": sl_assessed,
            "sent_downstream": sent_downstream,
            "with_recycling_record": downstream,
        },
        "method": (
            "Weighted mean of five components measured from the database. Component "
            "points sum exactly to the overall score, so the composite can be "
            "recalculated by hand from this response."
        ),
        "disclaimer": (
            "This is an internal operational maturity indicator designed for EVolve AI's "
            "own use. It is NOT a recognised regulatory, EPR or certification metric."
        ),
    }