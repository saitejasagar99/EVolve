"""
Module 1 - Data Quality & Confidence.

Computes a transparent Data Confidence Score from five measurable dimensions.
Every dimension is a named, weighted component and the arithmetic is returned
alongside the score, so a user can see exactly where confidence came from.

The score deliberately PENALISES bad data rather than pretending to predict
well on top of it. A battery with almost no history is reported as low
confidence and the forecast layer refuses to invent precision for it.
"""

from __future__ import annotations

from typing import Any

from .. import config

#: Weights must sum to 1.0 (asserted below).
CONFIDENCE_WEIGHTS: dict[str, float] = {
    "history_depth": 0.30,
    "completeness": 0.25,
    "uniqueness": 0.15,
    "range_validity": 0.15,
    "outlier_health": 0.15,
}

assert abs(sum(CONFIDENCE_WEIGHTS.values()) - 1.0) < 1e-9, "confidence weights must sum to 1"

#: Readings needed for a full-marks history depth score.
FULL_HISTORY_MONTHS = 24

#: Physical plausibility bounds used for the range-validity dimension.
RANGE_BOUNDS: dict[str, tuple[float, float]] = {
    "soc_pct": (0.0, 100.0),
    "voltage_v": (0.0, 1000.0),
    "temperature_c": (-40.0, 120.0),
    "soh": (0.0, 1.0),
}


def assess_quality(
    *,
    history_months: int,
    reading_count: int,
    missing_count: int,
    duplicate_count: int,
    invalid_count: int,
    outlier_count: int,
) -> dict[str, Any]:
    """
    Compute the Data Confidence Score (0-100) for one battery.

    Returns the score, its band, every component with its raw value and
    weighted contribution, and any blocking issues.
    """
    readings = max(reading_count, 0)
    issues: list[str] = []

    # 1) history depth - linear ramp to FULL_HISTORY_MONTHS
    hist = min(max(history_months, 0) / FULL_HISTORY_MONTHS, 1.0)
    if history_months < 6:
        issues.append(
            f"Only {history_months} months of history. "
            "Trend-based forecasting is unreliable below 6 months."
        )

    # 2) completeness - share of expected readings actually present
    expected = max(history_months, 1)
    present = max(readings - missing_count, 0)
    completeness = min(max(present / expected, 0.0), 1.0)
    if missing_count > 0:
        issues.append(f"{missing_count} missing telemetry reading(s).")

    # 3) uniqueness - duplicate records
    uniqueness = max(1.0 - (duplicate_count / max(readings, 1)), 0.0)
    if duplicate_count > 0:
        issues.append(f"{duplicate_count} duplicate record(s) detected.")

    # 4) range validity - physically impossible values
    range_validity = max(1.0 - (invalid_count / max(readings, 1)), 0.0)
    if invalid_count > 0:
        issues.append(f"{invalid_count} reading(s) outside physically valid ranges.")

    # 5) outlier health
    outlier_health = max(1.0 - (outlier_count / max(readings, 1)), 0.0)
    if outlier_count > 0:
        issues.append(f"{outlier_count} statistical outlier(s) need review.")

    raw = {
        "history_depth": hist,
        "completeness": completeness,
        "uniqueness": uniqueness,
        "range_validity": range_validity,
        "outlier_health": outlier_health,
    }

    components = [
        {
            "name": k,
            "weight": CONFIDENCE_WEIGHTS[k],
            "raw_score": round(v * 100, 2),
            "weighted_points": round(v * CONFIDENCE_WEIGHTS[k] * 100, 2),
        }
        for k, v in raw.items()
    ]
    score = round(sum(c["weighted_points"] for c in components), 2)

    if score >= config.CONFIDENCE_HIGH:
        band = "High"
    elif score >= config.CONFIDENCE_MODERATE:
        band = "Moderate"
    else:
        band = "Low"

    # A battery with too little history cannot support an EOL forecast, no
    # matter how clean the rows it does have are.
    forecast_possible = history_months >= 6 and readings >= 5
    if not forecast_possible:
        issues.append(
            "Insufficient historical data for reliable EOL horizon estimation."
        )

    return {
        "data_confidence": score,
        "confidence_band": band,
        "components": components,
        "reconciliation": {
            "sum_of_weighted_points": round(sum(c["weighted_points"] for c in components), 2),
            "data_confidence": score,
            "consistent": abs(sum(c["weighted_points"] for c in components) - score) < 0.01,
        },
        "issues": issues,
        "forecast_possible": forecast_possible,
        "blocking_reason": (
            None if forecast_possible
            else "Insufficient historical data for reliable EOL estimation."
        ),
        "method": (
            "Weighted sum of five measurable dimensions. Weights are named constants "
            "in services/quality.py and returned with every result."
        ),
    }


def fleet_quality_summary(assessments: list[dict[str, Any]]) -> dict[str, Any]:
    """Roll per-battery confidence up to a fleet view."""
    if not assessments:
        return {"batteries": 0, "mean_confidence": 0.0, "by_band": {},
                "low_confidence_count": 0}
    scores = [a["data_confidence"] for a in assessments]
    bands: dict[str, int] = {}
    for a in assessments:
        bands[a["confidence_band"]] = bands.get(a["confidence_band"], 0) + 1
    return {
        "batteries": len(assessments),
        "mean_confidence": round(sum(scores) / len(scores), 2),
        "by_band": bands,
        "low_confidence_count": sum(1 for a in assessments if a["confidence_band"] == "Low"),
        "forecast_blocked_count": sum(1 for a in assessments if not a["forecast_possible"]),
    }