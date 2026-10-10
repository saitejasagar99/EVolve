"""
Module 4 & 5 - Waste Prevention Engine.

THE CORE DIFFERENTIATOR
=======================
A degraded battery is NOT automatically waste. Every in-service battery is
routed through an ordered set of lifecycle pathways:

    1. CONTINUE_USE                still above the traction-use floor
    2. REPAIR_REFURBISHMENT        below traction floor, but recoverable
    3. SECOND_LIFE_ASSESSMENT      too degraded for vehicles, maybe for storage
    4. EOL_CANDIDATE               nothing left to preserve

This engine is a TRANSPARENT RULESET, not a learned model. That is a
deliberate choice: an operator must be able to read the rule that put their
battery into second-life assessment, and challenge it. Every response returns
`rules_fired` with the exact rule names, thresholds and inputs used.

It never certifies safety or second-life fitness. Every non-obvious pathway
output carries an explicit "requires technical assessment" qualifier.
"""

from __future__ import annotations

import json
from typing import Any

from .. import config

# --- Pathway identifiers ---------------------------------------------------
CONTINUE_USE = "CONTINUE_USE"
REPAIR_REFURBISHMENT = "REPAIR_REFURBISHMENT"
SECOND_LIFE_ASSESSMENT = "SECOND_LIFE_ASSESSMENT"
EOL_CANDIDATE = "EOL_CANDIDATE"

PATHWAY_LABELS = {
    CONTINUE_USE: "Continue use",
    REPAIR_REFURBISHMENT: "Repair / refurbishment assessment",
    SECOND_LIFE_ASSESSMENT: "Second-life assessment",
    EOL_CANDIDATE: "EOL candidate",
}

# --- Rule thresholds (named constants so they can be shown and challenged) ---
#: Above this SOH the pack stays in service.
TRACTION_USE_FLOOR_SOH = config.UNFIT_FOR_TRACTION_SOH          # 0.70
#: Above this SOH a repair/refurbishment is considered worthwhile.
REPAIR_VIABLE_SOH = 0.72
#: Below this SOH even stationary second-life is unlikely.
SECOND_LIFE_FLOOR_SOH = config.SECOND_LIFE_FLOOR_SOH            # 0.55
#: Below this SOH the pack is an EOL candidate.
EOL_CANDIDATE_SOH = config.EOL_SOH_THRESHOLD                    # 0.80
#: Anomaly severity that blocks continued unattended use pending inspection.
ANOMALY_BLOCK_SOH = 0.60

#: Cost basis for the ledger, in INR. Operator-editable; single source.
UNIT_COSTS_INR = {
    "repair_refurbishment": 42_000.0,
    "second_life_assessment": 9_500.0,
    "eol_collection": 6_800.0,
    "recycling_processing": 14_000.0,
    "avoided_purchase_price": 68_000.0,
}

#: Rough kg of avoided battery waste per retained pack (illustrative planning
#: figure, clearly labelled as an assumption rather than a measured value).
AVOIDED_WASTE_KG_PER_UNIT = 210.0


def decide_pathway(record: dict[str, Any]) -> dict[str, Any]:
    """
    Assign a lifecycle pathway to one battery, with the rules that fired.

    `record` is a Module 2 intelligence dict enriched with zone/fleet fields.
    """
    soh = record["soh_pct"] / 100.0
    age = record.get("battery_age_months", 0)
    cycles = record.get("charging_cycles", 0)
    anomaly = record.get("anomaly_score", 0.0)
    eol_months = record.get("eol_in_months")
    confidence = record.get("data_confidence", 0.0)
    temp_max = (record.get("temperature") or {}).get("history_max_c")

    rules: list[dict[str, Any]] = []

    def fire(name: str, statement: str, evidence: dict[str, Any]) -> None:
        rules.append({"rule": name, "statement": statement, "evidence": evidence})

    # ---- Rule 1: already past EOL, or far too degraded to preserve -----
    if soh < SECOND_LIFE_FLOOR_SOH:
        fire(
            "R1_BELOW_SECOND_LIFE_FLOOR",
            f"SOH {soh:.1%} is below the {SECOND_LIFE_FLOOR_SOH:.0%} second-life floor, "
            "so there is no realistic pathway left that preserves the pack.",
            {"soh": soh, "floor": SECOND_LIFE_FLOOR_SOH},
        )
        if anomaly >= 0.55:
            fire(
                "R2_ANOMALY_REINFORCES",
                f"Anomaly severity {anomaly:.2f} adds a physical concern to already "
                "severe capacity loss.",
                {"anomaly_score": anomaly},
            )
        pathway = EOL_CANDIDATE

    # ---- Rule 2: degraded but recoverable for stationary use -----------
    elif soh < REPAIR_VIABLE_SOH:
        fire(
            "R3_BELOW_REPAIR_VIABLE",
            f"SOH {soh:.1%} is below the {REPAIR_VIABLE_SOH:.0%} traction-use target "
            "but above the second-life floor.",
            {"soh": soh, "repair_viable_soh": REPAIR_VIABLE_SOH},
        )
        if temp_max and temp_max > 52:
            fire(
                "R4_THERMAL_HISTORY",
                f"Historical peak cell temperature of {temp_max:.1f} C indicates thermal "
                "stress, which is a common precursor to capacity loss.",
                {"history_max_c": temp_max},
            )
        pathway = SECOND_LIFE_ASSESSMENT

    # ---- Rule 3: repair or refurbishment before writing off -----------
    elif soh < TRACTION_USE_FLOOR_SOH:
        fire(
            "R5_BELOW_TRACTION_FLOOR",
            f"SOH {soh:.1%} is below the {TRACTION_USE_FLOOR_SOH:.0%} traction-use floor, "
            "so continued use in a vehicle is not supported.",
            {"soh": soh, "traction_floor": TRACTION_USE_FLOOR_SOH},
        )
        fire(
            "R6_ABOVE_SECOND_LIFE_FLOOR",
            f"SOH {soh:.1%} is still above the {SECOND_LIFE_FLOOR_SOH:.0%} second-life "
            "floor, so refurbishment should be assessed before disposal.",
            {"soh": soh, "second_life_floor": SECOND_LIFE_FLOOR_SOH},
        )
        pathway = REPAIR_REFURBISHMENT

    # ---- Rule 4: below EOL threshold but still fine for traction ------
    elif soh < EOL_CANDIDATE_SOH:
        fire(
            "R7_BELOW_EOL_THRESHOLD",
            f"SOH {soh:.1%} is below the {EOL_CANDIDATE_SOH:.0%} EOL threshold but above "
            f"the {TRACTION_USE_FLOOR_SOH:.0%} traction-use floor.",
            {"soh": soh, "eol_threshold": EOL_CANDIDATE_SOH},
        )
        if eol_months is not None and eol_months <= 3:
            fire(
                "R8_EOL_WITHIN_3_MONTHS",
                f"Estimated EOL horizon of {eol_months:.1f} months is inside three months, "
                "so a repair/refurbishment assessment is time-sensitive.",
                {"eol_in_months": eol_months},
            )
        # Thermal stress below the EOL threshold changes the recommendation even
        # though the SOH band is identical: a pack with a documented thermal
        # history needs inspection ahead of a comparable healthy pack.
        if temp_max and temp_max > 52:
            fire(
                "R8B_THERMAL_STRESS_BELOW_THRESHOLD",
                f"Peak cell temperature of {temp_max:.1f} C indicates thermal stress, "
                "which warrants assessment before relying on the SOH figure alone.",
                {"history_max_c": temp_max},
            )
        pathway = REPAIR_REFURBISHMENT

    # ---- Rule 5: healthy, keep using ----------------------------------
    else:
        fire(
            "R9_ABOVE_EOL_THRESHOLD",
            f"SOH {soh:.1%} is at or above the {EOL_CANDIDATE_SOH:.0%} EOL threshold.",
            {"soh": soh, "eol_threshold": EOL_CANDIDATE_SOH},
        )
        pathway = CONTINUE_USE

    # ---- Cross-cutting: a serious anomaly forces inspection ----------
    if anomaly >= 0.55 and soh < ANOMALY_BLOCK_SOH and pathway == CONTINUE_USE:
        fire(
            "R10_ANOMALY_REQUIRES_INSPECTION",
            f"Anomaly severity {anomaly:.2f} on an already degraded pack means continued "
            "unattended use is not appropriate until a technician looks at it.",
            {"anomaly_score": anomaly, "soh": soh},
        )
        pathway = REPAIR_REFURBISHMENT

    # ---- Confidence is always disclosed, never used to force an outcome
    if confidence < config.CONFIDENCE_MODERATE:
        fire(
            "R11_LOW_DATA_CONFIDENCE",
            f"Data confidence is {confidence:.0f}%. The pathway is provisional and should "
            "be re-evaluated once more telemetry arrives.",
            {"data_confidence": confidence},
        )

    if eol_months is not None and eol_months <= 0 and pathway != EOL_CANDIDATE:
        # The ML horizon says "already past threshold" while the rules say
        # something recoverable. That is a genuine disagreement worth surfacing.
        fire(
            "R12_HORIZON_PATHWAY_DISAGREEMENT",
            "The ML EOL horizon indicates the pack is already past the EOL threshold, "
            "while the pathway rules retain it. Verify physically before acting.",
            {"eol_in_months": eol_months, "pathway": pathway},
        )

    # ---- Build the output ---------------------------------------------
    is_eol = pathway == EOL_CANDIDATE
    avoided_units = 0.0 if is_eol else 1.0

    cost_key = {
        CONTINUE_USE: None,
        REPAIR_REFURBISHMENT: "repair_refurbishment",
        SECOND_LIFE_ASSESSMENT: "second_life_assessment",
        EOL_CANDIDATE: "eol_collection",
    }[pathway]

    return {
        "battery_id": record.get("battery_id", "unknown"),
        "vehicle_id": record.get("vehicle_id", "unknown"),
        "zone": record.get("zone"),
        "pathway": pathway,
        "pathway_label": PATHWAY_LABELS[pathway],
        "rules_fired": rules,
        "rule_count": len(rules),
        "soh_pct": round(record["soh_pct"], 2),
        "eol_in_months": record.get("eol_in_months"),
        "data_confidence": record.get("data_confidence"),
        "confidence_band": record.get("confidence_band"),
        "anomaly_score": record.get("anomaly_score"),
        "potential_avoided_units": avoided_units,
        "potential_avoided_waste_kg": round(avoided_units * AVOIDED_WASTE_KG_PER_UNIT, 1),
        "estimated_intervention_cost_inr": (
            UNIT_COSTS_INR[cost_key] if cost_key else 0.0
        ),
        "actionable": pathway != CONTINUE_USE,
        "requires_technical_assessment": pathway
        in (REPAIR_REFURBISHMENT, SECOND_LIFE_ASSESSMENT),
        "wording": _wording(pathway, record),
        "decision_basis": "transparent ruleset (services/prevention.py)",
    }


def _wording(pathway: str, record: dict[str, Any]) -> str:
    """Responsible-language phrasing per pathway. No safety certification."""
    soh = record["soh_pct"]
    if pathway == CONTINUE_USE:
        return (
            f"SOH {soh:.1f}% is at or above the EOL threshold. Continue normal operation "
            "and routine monitoring; no intervention indicated."
        )
    if pathway == REPAIR_REFURBISHMENT:
        return (
            f"SOH {soh:.1f}% indicates capacity loss below the traction-use target but "
            "with recoverable headroom. Repair/refurbishment assessment recommended before "
            "treating this pack as an EOL waste candidate. Requires technical assessment."
        )
    if pathway == SECOND_LIFE_ASSESSMENT:
        return (
            f"SOH {soh:.1f}% is below the traction-use floor, so continued vehicle use is "
            "not supported. Potentially suitable for second-life assessment - a technical "
            "evaluation is required to confirm fitness for any stationary application."
        )
    return (
        f"SOH {soh:.1f}% shows severe capacity loss with no realistic preservation pathway. "
        "EOL candidate - prioritize responsible collection and downstream technical "
        "assessment. EVolve AI does not certify this pack unsafe; that determination "
        "requires physical inspection."
    )


def build_ledger(decisions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Module 5 - fleet-level Waste Avoidance Ledger.
    """
    counts = {p: 0 for p in PATHWAY_LABELS}
    for d in decisions:
        counts[d["pathway"]] += 1

    eol = counts[EOL_CANDIDATE]
    retained = counts[CONTINUE_USE] + counts[REPAIR_REFURBISHMENT] + counts[SECOND_LIFE_ASSESSMENT]
    repair = counts[REPAIR_REFURBISHMENT]
    second = counts[SECOND_LIFE_ASSESSMENT]
    avoidable = repair + second

    avoided_waste = avoided = round(
        sum(d["potential_avoided_units"] for d in decisions), 1
    )
    intervention_cost = round(
        sum(d["estimated_intervention_cost_inr"] for d in decisions if d["actionable"]), 2
    )
    purchase_avoided = round(
        avoidable * UNIT_COSTS_INR["avoided_purchase_price"], 2
    )

    return {
        "label": "ESTIMATED POTENTIAL - not a guaranteed saving",
        "method": (
            "Every non-EOL pathway is counted as one retained battery unit. The avoided "
            "purchase value assumes each retained pack defers one replacement. Both are "
            "planning assumptions defined in services/prevention.py, not measured savings."
        ),
        "counts": {
            "continue_use": counts[CONTINUE_USE],
            "repair_refurbishment": repair,
            "second_life_assessment": second,
            "eol_candidate": eol,
        },
        "total_batteries": len(decisions),
        "retained_batteries": retained,
        "potential_intervention_candidates": avoidable,
        "potential_eol_candidates": eol,
        "potential_eol_waste_avoided_units": avoided,
        "potential_eol_waste_avoided_kg": round(
            sum(d["potential_avoided_waste_kg"] for d in decisions), 1
        ),
        "estimated_intervention_cost_inr": intervention_cost,
        "estimated_purchase_value_avoided_inr": purchase_avoided,
        "net_estimated_benefit_inr": round(purchase_avoided - intervention_cost, 2),
        "prevention_ratio_pct": round(
            (retained / len(decisions) * 100) if decisions else 0.0, 1
        ),
        "cost_basis_inr": UNIT_COSTS_INR,
        "disclaimer": (
            "Avoided-waste and avoided-purchase figures are estimates based on documented "
            "assumptions. They are decision support, not audited financial outcomes."
        ),
    }


def pathway_for_battery(db, battery_id: str) -> dict[str, Any] | None:
    """Convenience helper used by the API for a single battery."""
    from ..ml.trainer import ModelBundle, make_feature_frame
    from ..database.models import Battery, BatteryReading
    from .battery_intelligence import analyse_battery
    from .fleet import load_records

    records, _ = load_records(db)
    match = next((r for r in records if r["battery_id"] == battery_id), None)
    if match is None:
        return None
    return decide_pathway(match)