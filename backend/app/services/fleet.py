"""
Fleet loading: the single bridge between the database and the ML models.

`load_records()` is the only place that reads batteries + readings, runs the
models, and returns analysed records. Every downstream service consumes its
output, so there is exactly one definition of "a battery's current state".

Results are cached per (dataset_version, model_version) because the models are
deterministic - recomputing on every request would make the API needlessly slow
without changing a single number.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select

from .. import config
from ..database.models import Anomaly, Battery, BatteryReading, Vehicle
from ..ml.trainer import ANOMALY_FEATURE_COLUMNS, FEATURE_COLUMNS, ModelBundle, make_feature_frame
from .battery_intelligence import analyse_battery

_LOCK = threading.Lock()
_CACHE: dict[str, Any] = {"key": None, "records": [], "predictions": {}}

MODEL_VERSION = "evolve-1.0.0"


def _dataset_key(db) -> str:
    """Cheap change-detector: row counts plus the newest install timestamp."""
    n = db.scalar(select(func.count(Battery.id))) or 0
    latest = db.scalar(select(func.max(Battery.created_at)))
    src = db.execute(
        select(Battery.data_source, func.count(Battery.id)).group_by(Battery.data_source)
    ).all()
    return f"{n}|{latest}|{sorted(src)}"


def load_records(db=None, force: bool = False) -> tuple[list[dict[str, Any]], ModelBundle]:
    """
    Return (analysed_records, model_bundle).

    Records include vehicle/zone context and the latest anomaly evidence, which
    the prevention engine needs.
    """
    bundle = ModelBundle()
    if not bundle.ready:
        raise RuntimeError(
            "Models are not trained. Start the API (trains on boot when artifacts are "
            "missing) or POST /api/ml/train."
        )

    # A session may be closed, so allow the caller to pass None and open one.
    own_session = db is None
    if own_session:
        from ..database.base import session_scope

        ctx = session_scope()
        db = ctx.__enter__()

    try:
        return _load_records_inner(db, bundle, force)
    finally:
        if own_session:
            ctx.__exit__(None, None, None)


def _load_records_inner(db, bundle, force: bool) -> tuple[list[dict[str, Any]], ModelBundle]:
    key = _dataset_key(db)
    with _LOCK:
        if not force and _CACHE["key"] == key and _CACHE["records"]:
            return _CACHE["records"], bundle

    # ---- load rows -----------------------------------------------------
    rows = db.execute(
        select(Battery, Vehicle).join(Vehicle, Battery.vehicle_id == Vehicle.id)
    ).all()

    if not rows:
        with _LOCK:
            _CACHE.update({"key": key, "records": [], "predictions": {}})
        return [], bundle

    specs: list[dict[str, Any]] = []
    for battery, vehicle in rows:
        history_months = battery.history_months or 0
        daily_km = vehicle.annual_distance_km / 365.0 if vehicle.annual_distance_km else 0.0
        energy_per_km = (
            vehicle.distance_travelled_km and 0.0
        ) or (battery.rated_capacity_kwh / 320.0)
        specs.append(
            {
                "battery_id": battery.battery_id,
                "battery_uid": battery.battery_uid,
                "vehicle_id": vehicle.vehicle_id,
                "vehicle_model": vehicle.model_name,
                "fleet_id": vehicle.fleet_id,
                "zone": vehicle.zone,
                "latitude": vehicle.latitude,
                "longitude": vehicle.longitude,
                "priority": vehicle.priority,
                "chemistry": battery.chemistry,
                "rated_capacity_kwh": battery.rated_capacity_kwh,
                "months_in_service": float(history_months),
                "daily_km": float(daily_km),
                "equivalent_full_cycles": float(battery.charging_cycles),
                "energy_per_km": float(energy_per_km),
                "avg_charge_rate_c": 1.0 + battery.fast_charge_ratio,
                "fast_charge_ratio": float(battery.fast_charge_ratio),
                "depth_of_discharge": 0.6,
                "ambient_temp_c": float(max(battery.temperature_c - 12.0, 5.0)),
                "avg_cell_temp_c": float(battery.temperature_c),
                "peak_cell_temp_c": float(battery.peak_temperature_c),
                "cell_voltage_spread_mv": float(battery.cell_voltage_spread_mv),
                "dc_resistance_mohm": float(battery.dc_resistance_mohm),
                "measured_capacity_fade_pct": float(battery.measured_capacity_fade_pct),
            }
        )

    frame = make_feature_frame(specs)
    preds = bundle.predict(frame)

    # ---- readings per battery ------------------------------------------
    rid_rows = db.execute(select(BatteryReading.battery_id, BatteryReading)).all()
    by_batt: dict[int, list[dict[str, Any]]] = {}
    for bid, r in rid_rows:
        by_batt.setdefault(bid, []).append(
            {
                "month_index": r.month_index,
                "soh": r.soh,
                "soc_pct": r.soc_pct,
                "voltage_v": r.voltage_v,
                "current_a": r.current_a,
                "temperature_c": r.temperature_c,
                "charging_cycles": r.charging_cycles,
                "energy_delivered_kwh": r.energy_delivered_kwh,
                "distance_km": r.distance_km,
            }
        )

    # ---- latest anomaly evidence --------------------------------------
    anom_rows = db.execute(select(Anomaly.battery_id, Anomaly)).all()
    latest_anom: dict[int, dict[str, Any]] = {}
    for bid, a in anom_rows:
        prev = latest_anom.get(bid)
        if prev is None or a.detected_at > prev["detected_at"]:
            latest_anom[bid] = {
                "kind": a.kind, "severity": a.severity, "evidence": a.evidence,
                "status": a.status, "detected_at": a.detected_at,
            }

    records: list[dict[str, Any]] = []
    for i, (battery, vehicle) in enumerate(rows):
        rec = analyse_battery(
            battery, by_batt.get(battery.id, []), {k: v[i] for k, v in preds.items()}
        )
        rec.update(
            {
                "battery_row_id": battery.id,
                "vehicle_row_id": vehicle.id,
                # Overwrite the FK with the PUBLIC vehicle id. analyse_battery
                # copies `battery.vehicle_id`, which is the integer primary key,
                # so without this the API would emit a row id where a caller
                # expects a vehicle identifier.
                "vehicle_id": vehicle.vehicle_id,
                "vehicle_model": vehicle.model_name,
                "fleet_id": vehicle.fleet_id,
                "zone": vehicle.zone,
                "latitude": vehicle.latitude,
                "longitude": vehicle.longitude,
                "fleet_priority": vehicle.priority,
                "daily_km": round(vehicle.annual_distance_km / 365.0, 1),
                "distance_travelled_km": vehicle.distance_travelled_km,
                "lifecycle_status": battery.lifecycle_status,
                "collection_status": battery.collection_status,
                "second_life_status": battery.second_life_status,
                "recycling_status": battery.recycling_status,
                "last_inspection_on": (
                    battery.last_inspection_on.isoformat() if battery.last_inspection_on else None
                ),
                "rating_label": (
                    f"{battery.rated_capacity_kwh:.0f} kWh"
                    if battery.rated_capacity_kwh else "unknown"
                ),
                # Persist the EXACT feature vector handed to the models. The
                # simulator re-runs the same models, so it must reuse these
                # values rather than reconstructing them - otherwise a scenario
                # with no parameter changed would produce different numbers.
                # Only the numeric model inputs, so the simulator can replay
                # them without tripping over identifier or label columns.
                "model_features": {
                    k: float(frame.iloc[i][k])
                    for k in FEATURE_COLUMNS
                    if k in frame.columns
                },
                "anomaly_evidence": latest_anom.get(battery.id),
                "history_months": battery.history_months,
                "reading_count": battery.reading_count,
                "missing_reading_count": battery.missing_reading_count,
                "duplicate_record_count": battery.duplicate_record_count,
                "invalid_range_count": battery.invalid_range_count,
                "outlier_count": battery.outlier_count,
            }
        )
        records.append(rec)

    with _LOCK:
        _CACHE.update({"key": key, "records": records, "predictions": preds})
    return records, bundle


def invalidate() -> None:
    """Force the next load_records() to recompute."""
    with _LOCK:
        _CACHE["key"] = None


def predictions_available() -> bool:
    return bool(_CACHE["records"])


def model_feature_columns() -> list[str]:
    return list(FEATURE_COLUMNS)


def anomaly_feature_columns() -> list[str]:
    return list(ANOMALY_FEATURE_COLUMNS)