"""
Module 14 - Action Plan.

Turns the other modules' outputs into three concrete, time-boxed worklists.
Every item names the batteries it refers to, so nothing here is generic advice.
"""

from __future__ import annotations

from typing import Any


def build_action_plan(
    records: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    forecast: dict[str, Any],
    queue: dict[str, Any],
    batches: dict[str, Any],
    capacity: dict[str, Any],
    blind_spots: dict[str, Any],
    circularity: dict[str, Any],
) -> dict[str, Any]:
    rec_by_id = {r["battery_id"]: r for r in records}
    path_by_id = {d["battery_id"]: d for d in decisions}

    immediate: list[dict[str, Any]] = []
    next_30: list[dict[str, Any]] = []
    next_6m: list[dict[str, Any]] = []

    # ---- IMMEDIATE: top EOL priorities and the batches covering them ----
    top = queue["queue"][:5]
    if top:
        immediate.append(
            {
                "action": f"Prioritise collection of {len(top)} highest-priority EOL batteries",
                "batteries": [t["battery_id"] for t in top],
                "rationale": (
                    "These have the highest estimated EOL urgency and degradation severity. "
                    "They remain in the queue until physically collected."
                ),
                "priority": "CRITICAL",
            }
        )
    if batches["batches"]:
        first = batches["batches"][0]
        immediate.append(
            {
                "action": f"Execute collection batch {first['batch_code']} ({first['zone']})",
                "batteries": first["batteries"],
                "rationale": (
                    f"{first['battery_count']} batteries in one zone, "
                    f"{first['estimated_distance_km']} km total, saving "
                    f"{first['distance_saved_vs_solo_km']} km versus separate visits."
                ),
                "priority": "HIGH",
            }
        )

    anomaly_candidates = [
        r["battery_id"] for r in records
        if r["anomaly_status"] == "POTENTIAL_ANOMALY" and r["soh_pct"] < 80
    ][:5]
    if anomaly_candidates:
        immediate.append(
            {
                "action": f"Schedule technical inspection for {len(anomaly_candidates)} anomaly candidates",
                "batteries": anomaly_candidates,
                "rationale": (
                    "An anomaly score is a signal, not a confirmed fault. Inspection "
                    "converts the signal into evidence before any waste decision."
                ),
                "priority": "HIGH",
            }
        )

    # ---- NEXT 30 DAYS ----
    eol_now = forecast["horizons"]["next_3_months"]
    if eol_now["predicted_eol_count"]:
        next_30.append(
            {
                "action": (
                    f"Confirm downstream handling for {eol_now['predicted_eol_count']} "
                    "batteries forecast to reach EOL within 3 months"
                ),
                "batteries": eol_now["battery_ids"][:12],
                "rationale": (
                    f"Mean data confidence for this group is "
                    f"{eol_now['mean_confidence']}%. Confirm with physical inspection "
                    "before committing to a route."
                ),
                "priority": "HIGH",
            }
        )

    sl = [d for d in decisions if d["pathway"] == "SECOND_LIFE_ASSESSMENT"]
    if sl:
        next_30.append(
            {
                "action": f"Book second-life technical assessment for {len(sl)} batteries",
                "batteries": [d["battery_id"] for d in sl][:12],
                "rationale": (
                    "These are below the traction-use floor but above the second-life "
                    "floor. Assessment is required before any fit-for-purpose claim."
                ),
                "priority": "MEDIUM",
            }
        )

    unscheduled = batches.get("unscheduled", [])
    if unscheduled:
        next_30.append(
            {
                "action": (
                    f"Increase collection capacity or reschedule {len(unscheduled)} "
                    "unscheduled EOL batteries"
                ),
                "batteries": [u["battery_id"] for u in unscheduled][:12],
                "rationale": (
                    f"Available trips this period ({batches['trips_available']}) cannot "
                    "cover the queue. These batteries are deferred, not dismissed."
                ),
                "priority": "HIGH",
            }
        )

    # ---- NEXT 6 MONTHS ----
    if capacity["status"] == "CAPACITY_MISMATCH":
        next_6m.append(
            {
                "action": (
                    f"Close a downstream processing gap of "
                    f"{capacity['gap']['processing_gap_units']:.1f} units/month"
                ),
                "batteries": [],
                "rationale": capacity["recommendation"],
                "priority": "CRITICAL",
            }
        )

    if capacity.get("unverified_handler_count"):
        next_6m.append(
            {
                "action": (
                    f"Verify certification status for "
                    f"{capacity['unverified_handler_count']} downstream handler(s)"
                ),
                "batteries": [],
                "rationale": capacity["unverified_handler_note"],
                "priority": "MEDIUM",
            }
        )

    low_conf = [r["battery_id"] for r in records if r["confidence_band"] == "Low"]
    if low_conf:
        next_6m.append(
            {
                "action": f"Improve telemetry coverage for {len(low_conf)} low-confidence batteries",
                "batteries": low_conf[:12],
                "rationale": (
                    "Insufficient history blocks reliable EOL estimation. Better data "
                    "coverage improves every downstream decision for these packs."
                ),
                "priority": "MEDIUM",
            }
        )

    if blind_spots["total_findings"]:
        next_6m.append(
            {
                "action": (
                    f"Close {blind_spots['total_findings']} environmental blind-spot "
                    f"record(s) across {blind_spots['affected_batteries']} batteries"
                ),
                "batteries": sorted(
                    {f["battery_id"] for v in blind_spots["findings"].values() for f in v}
                )[:12],
                "rationale": blind_spots["why_it_matters"],
                "priority": "HIGH",
            }
        )

    weakest = circularity.get("weakest_component")
    if weakest:
        next_6m.append(
            {
                "action": f"Improve the weakest circularity component: {weakest['name'].replace('_', ' ')}",
                "batteries": [],
                "rationale": (
                    f"Currently {weakest['pct']}%, the lowest of five components. "
                    "Circularity is the aggregate of these, so lifting the weakest "
                    "component moves the score most."
                ),
                "priority": "MEDIUM",
            }
        )

    return {
        "generated_from": "forecast, prevention, collection, capacity, blind-spot and circularity services",
        "note": (
            "Every item references the specific batteries it concerns. Nothing here is "
            "generic advice, and nothing is generated by a language model."
        ),
        "horizons": [
            {"horizon": "IMMEDIATE", "items": immediate, "count": len(immediate)},
            {"horizon": "NEXT_30_DAYS", "items": next_30, "count": len(next_30)},
            {"horizon": "NEXT_6_MONTHS", "items": next_6m, "count": len(next_6m)},
        ],
        "totals": {
            "immediate": len(immediate),
            "next_30_days": len(next_30),
            "next_6_months": len(next_6m),
        },
    }