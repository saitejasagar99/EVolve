"""
Module 2 - Battery Intelligence.

Per-battery supporting signals: SOH, degradation trend, EOL horizon, anomaly
score, confidence, age, cycles and thermal history.

This module is SUPPORTING intelligence. It does not decide waste pathways -
that is the prevention engine's job (services/prevention.py). Keeping the
separation honest prevents "degraded" from silently meaning "waste".

Wording rules enforced here:
  * an anomaly is a SIGNAL for review, never a confirmed fault
  * RUL / EOL is always an ESTIMATE, always shown with its model spread band
"""

from __future__ import annotations

from typing import Any

import numpy as np

from .. import config
from .quality import assess_quality

#: Anomaly severity at or above which a technical inspection is recommended.
#: This is a REVIEW THRESHOLD, not a failure threshold.
ANOMALY_REVIEW_THRESHOLD = 0.55


def _trend(readings: list[dict]) -> dict[str, Any]:
    """
    Fit a least-squares trend to the SOH series.

    Returns points-per-month degradation plus an explicit note when the series
    is too short or too flat to support a trend claim.
    """
    pts = sorted(
        [(r["month_index"], r["soh"]) for r in readings
         if r.get("soh") is not None and r.get("month_index") is not None],
        key=lambda t: t[0],
    )
    if len(pts) < 4:
        return {
            "degradation_per_month": None,
            "trend_direction": "INSUFFICIENT_DATA",
            "monthly_degradation_pct": None,
            "note": (
                f"Only {len(pts)} usable SOH readings. A degradation trend needs at "
                "least 4 points, so none is claimed."
            ),
            "points": len(pts),
        }

    x = np.array([p[0] for p in pts], dtype=float)
    y = np.array([p[1] for p in pts], dtype=float) * 100.0  # percent
    slope = float(np.polyfit(x, y, 1)[0])

    if abs(slope) < 1e-4:
        direction = "STABLE"
    elif slope < 0:
        direction = "DEGRADING"
    else:
        direction = "IMPROVING"  # unusual; worth surfacing rather than hiding

    return {
        "degradation_per_month": round(-slope, 5) if slope < 0 else round(slope, 5),
        "trend_direction": direction,
        "monthly_degradation_pct": round(abs(slope), 4),
        "note": (
            "Least-squares slope over the available SOH history."
            if len(pts) >= 6 else
            f"Fitted on only {len(pts)} points - treat this slope as indicative only."
        ),
        "points": len(pts),
    }


def analyse_battery(battery, readings: list[dict], preds: dict[str, Any]) -> dict[str, Any]:
    """
    Assemble the full intelligence record for one battery.

    `preds` is the slice of ModelBundle.predict() for this battery.
    """
    hist = sorted(readings, key=lambda r: r["month_index"])

    quality = assess_quality(
        history_months=battery.history_months,
        reading_count=len(hist) or battery.reading_count,
        missing_count=battery.missing_reading_count,
        duplicate_count=battery.duplicate_record_count,
        invalid_count=battery.invalid_range_count,
        outlier_count=battery.outlier_count,
    )

    trend = _trend(hist)

    soh = float(preds["soh"])
    eol = float(preds["eol"])
    anomaly = float(preds["anomaly"])

    # Confidence gates the forecast. Low confidence means we refuse to present a
    # point estimate as if it were reliable.
    if not quality["forecast_possible"]:
        eol_display: float | None = None
        eol_range = None
        forecast_note = quality["blocking_reason"]
    else:
        eol_display = eol
        eol_range = {
            "low": round(float(preds["eol_low"]), 1),
            "high": round(float(preds["eol_high"]), 1),
        }
        forecast_note = (
            f"Estimated {eol:.1f} months until SOH crosses the "
            f"{config.EOL_SOH_THRESHOLD:.0%} EOL threshold, assuming the observed duty "
            "cycle continues. This is an estimate, not a guarantee."
        )

    anomaly_flagged = anomaly >= ANOMALY_REVIEW_THRESHOLD

    temps = [r["temperature_c"] for r in hist if r.get("temperature_c") is not None]

    return {
        "battery_id": battery.battery_id,
        "battery_uid": battery.battery_uid,
        "vehicle_id": battery.vehicle_id,
        # ---- health ----
        "soh_pct": round(soh * 100, 2),
        "soh_low_pct": round(float(preds["soh_low"]) * 100, 2),
        "soh_high_pct": round(float(preds["soh_high"]) * 100, 2),
        "soh_measured_pct": round(battery.current_soh * 100, 2),
        "chemistry": battery.chemistry,
        "rated_capacity_kwh": battery.rated_capacity_kwh,
        # ---- degradation ----
        "trend": trend,
        "months_since_manufacture": _months_between(battery.manufactured_on),
        "battery_age_months": _months_between(battery.manufactured_on),
        "charging_cycles": battery.charging_cycles,
        "fast_charge_ratio": round(battery.fast_charge_ratio, 3),
        "daily_km": None,
        # ---- EOL horizon ----
        "eol_in_months": eol_display,
        "eol_range": eol_range,
        "eol_threshold_soh_pct": config.EOL_SOH_THRESHOLD * 100,
        "eol_estimate_note": forecast_note,
        "already_below_eol_threshold": bool(soh < config.EOL_SOH_THRESHOLD),
        # ---- anomaly ----
        "anomaly_score": round(anomaly, 4),
        "anomaly_status": "POTENTIAL_ANOMALY" if anomaly_flagged else "NO_SIGNAL",
        "anomaly_wording": (
            "Potential anomaly detected - technical inspection recommended. "
            "This is a signal, not a confirmed battery fault."
            if anomaly_flagged else
            "No anomaly signal detected in the available telemetry."
        ),
        # ---- data quality ----
        "data_confidence": quality["data_confidence"],
        "confidence_band": quality["confidence_band"],
        "data_quality_issues": quality["issues"],
        "forecast_possible": quality["forecast_possible"],
        # ---- thermal ----
        "temperature": {
            "current_c": round(battery.temperature_c, 2),
            "peak_c": round(battery.peak_temperature_c, 2),
            "history_mean_c": round(float(np.mean(temps)), 2) if temps else None,
            "history_max_c": round(float(np.max(temps)), 2) if temps else None,
            "readings_with_temperature": len(temps),
        },
        # ---- provenance ----
        "data_source": battery.data_source,
        "simulation_notice": (
            "SYNTHETIC DEMO DATA - not measured battery data."
            if battery.data_source == "SIMULATED"
            else "Operator-supplied data, not validated against a physical BMS."
        ),
    }


def _months_between(dt) -> int:
    from datetime import datetime, timezone

    if dt is None:
        return 0
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max((now - dt).days // 30, 0)