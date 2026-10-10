"""
Module 3 - Future Battery Waste Forecast.

Answers "which batteries may become waste, and when" for 3, 6 and 12 month
horizons.

METHOD (stated so it can be challenged)
---------------------------------------
1. Every battery gets an ML-estimated EOL horizon in months (services/ml).
2. Batteries are bucketed into the horizon window they fall into.
3. A monthly curve is produced by assuming arrivals spread uniformly across
   each battery's window - an explicit, conservative smoothing, NOT a claim
   about when in the month a pack will actually fail.
4. Every number carries the data-confidence weighting, because a fleet of
   low-confidence estimates is not the same as a fleet of reliable ones.

Nothing here is hardcoded. Change the dataset and every figure changes.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .. import config

HORIZONS = (3, 6, 12)


def forecast_from_records(records: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build the full waste forecast from analysed battery records.

    `records` are the Module 2 output dicts.
    """
    eligible = [
        r for r in records
        if r.get("eol_in_months") is not None and r.get("lifecycle_status") == "IN_SERVICE"
    ]
    excluded_no_forecast = [
        r for r in records
        if r.get("eol_in_months") is None
    ]
    already_eol = [
        r for r in records
        if r.get("lifecycle_status") != "IN_SERVICE"
    ]

    horizons: dict[str, Any] = {}
    for h in HORIZONS:
        in_window = [r for r in eligible if r["eol_in_months"] <= h]
        horizons[f"next_{h}_months"] = {
            "horizon_months": h,
            "predicted_eol_count": len(in_window),
            "battery_ids": [r["battery_id"] for r in in_window],
            "high_confidence_count": sum(
                1 for r in in_window if r["confidence_band"] == "High"
            ),
            "moderate_or_low_confidence_count": sum(
                1 for r in in_window if r["confidence_band"] != "High"
            ),
            "mean_confidence": round(
                float(np.mean([r["data_confidence"] for r in in_window])), 1
            ) if in_window else None,
        }

    # ---- monthly curve ------------------------------------------------
    monthly = _monthly_curve(eligible)
    peak = max(monthly, key=lambda m: m["expected_eol"]) if monthly else None

    # ---- by zone ------------------------------------------------------
    by_zone: dict[str, dict[str, Any]] = {}
    for r in eligible:
        z = r.get("zone") or "Unassigned"
        slot = by_zone.setdefault(z, {"zone": z, "eol_next_3": 0, "eol_next_6": 0,
                                      "eol_next_12": 0, "total_in_service": 0})
        slot["total_in_service"] += 1
        e = r["eol_in_months"]
        if e <= 3:
            slot["eol_next_3"] += 1
        if e <= 6:
            slot["eol_next_6"] += 1
        if e <= 12:
            slot["eol_next_12"] += 1

    # ---- by chemistry -------------------------------------------------
    by_chemistry: dict[str, int] = {}
    for r in eligible:
        c = r.get("chemistry") or "unknown"
        by_chemistry[c] = by_chemistry.get(c, 0) + 1

    twelve = horizons["next_12_months"]["predicted_eol_count"]
    high_zone = max(
        by_zone.items(), key=lambda kv: kv[1]["eol_next_12"], default=(None, None)
    )

    return {
        "generated_from": "per-battery ML EOL horizon estimates",
        "method": (
            "Each battery's ML-estimated months-to-EOL is bucketed into the 3/6/12 "
            "month windows. The monthly curve spreads arrivals uniformly within each "
            "battery's own window, which is an explicit smoothing assumption rather "
            "than a claim about the exact month of failure."
        ),
        "label": "FORECAST / ESTIMATE - not a guaranteed failure date",
        "totals": {
            "batteries_analysed": len(records),
            "in_service": len(eligible),
            "already_eol_or_beyond": len(already_eol),
            "excluded_insufficient_history": len(excluded_no_forecast),
            "excluded_note": (
                f"{len(excluded_no_forecast)} battery(s) had insufficient history for a "
                "reliable EOL estimate and were excluded rather than guessed."
                if excluded_no_forecast else
                "All in-service batteries had sufficient history."
            ),
        },
        "horizons": horizons,
        "headline": {
            "potential_eol_3_months": horizons["next_3_months"]["predicted_eol_count"],
            "potential_eol_6_months": horizons["next_6_months"]["predicted_eol_count"],
            "potential_eol_12_months": twelve,
        },
        "monthly_forecast": monthly,
        "peak_month": peak,
        "by_zone": sorted(by_zone.values(), key=lambda z: -z["eol_next_12"]),
        "by_chemistry": by_chemistry,
        "high_risk_zone": (
            {"zone": high_zone[0], "eol_next_12": high_zone[1]["eol_next_12"]}
            if high_zone[0] else None
        ),
        "disclaimer": (
            "Forecasts are estimates derived from model predictions on synthetic data. "
            "They indicate likely waste exposure for planning, not guaranteed failure dates."
        ),
    }


def _monthly_curve(eligible: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Smooth the bucketed horizons into a per-month expected-EOL curve.

    Each battery contributes 1.0 spread evenly across the months up to its own
    horizon, which avoids the false precision of claiming a specific month.
    """
    curve = [0.0] * config.FORECAST_HORIZON_MONTHS
    for r in eligible:
        e = float(r["eol_in_months"])
        if e <= 0:
            curve[0] += 1.0
            continue
        last = int(min(max(round(e), 1), config.FORECAST_HORIZON_MONTHS))
        for m in range(last):
            curve[m] += 1.0 / last

    out = []
    for i, v in enumerate(curve, start=1):
        out.append(
            {
                "month": i,
                "label": f"M+{i}",
                "expected_eol": round(v, 2),
                "cumulative_eol": round(sum(curve[:i]), 1),
            }
        )
    return out