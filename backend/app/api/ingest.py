"""Upload ingestion: replace the active dataset with an operator CSV."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from .. import config
from ..data.demo_seed import true_soh
from ..database.models import (
    Battery,
    BatteryReading,
    Fleet,
    LifecycleEvent,
    ProcessingHandler,
    Vehicle,
)

NOW = datetime.now(timezone.utc)

#: Months of synthetic history synthesised for an uploaded pack, so the trend
#: and forecast services have something to work with. Derived from the duty
#: cycle the operator supplied, NOT presented as observed history.
IMPORTED_HISTORY_MONTHS = 12


def replace_dataset(db: Session, df, filename: str,
                    coerced: dict[str, int] | None = None) -> dict[str, Any]:
    """
    Replace all batteries with the uploaded rows.

    Every imported battery is tagged ``data_source="UPLOADED"`` so the
    provenance label flips across the whole UI. Lifecycle fields absent from the
    CSV are left empty rather than invented, which means Module 10 correctly
    reports them as traceability gaps instead of hiding them.
    """
    coerced = coerced or {}

    # Delete in FK-dependency order, including the tables that reference
    # batteries, otherwise the FK constraint rejects the wipe.
    from ..database.models import (
        Anomaly,
        CollectionTask,
        CustomerAssessment,
        HealthPrediction,
        MaintenanceRecord,
        RecyclingRecord,
        WasteIntervention,
    )

    for model in (
        CustomerAssessment,
        HealthPrediction, Anomaly, MaintenanceRecord, WasteIntervention,
        RecyclingRecord, CollectionTask, BatteryReading, LifecycleEvent,
        Battery, Vehicle,
    ):
        db.query(model).delete(synchronize_session=False)
    db.flush()

    raw_zones = df["zone"] if "zone" in df.columns else None
    zones = (
        [str(z) for z in sorted(raw_zones.dropna().unique())]
        if raw_zones is not None else []
    ) or ["Unassigned"]

    fleet_objs: dict[str, Fleet] = {}

    def _fleet_for(zone: str) -> Fleet:
        if zone not in fleet_objs:
            f = Fleet(
                fleet_id=f"IMP-F{len(fleet_objs):02d}",
                name=f"Imported fleet - {zone}",
                operator_name="Uploaded by operator",
                zone=zone,
                city="Imported",
                priority="Standard",
            )
            db.add(f)
            db.flush()
            fleet_objs[zone] = f
        return fleet_objs[zone]

    for z in zones:
        _fleet_for(z)

    if db.query(ProcessingHandler).count() == 0:
        db.add_all([
            ProcessingHandler(
                handler_id="HND-IMP-01", name="Imported Recycler A", kind="RECYCLER",
                zone=zones[0], city="Imported", monthly_capacity_units=10,
                certification_status="UNVERIFIED",
            ),
            ProcessingHandler(
                handler_id="HND-IMP-02", name="Imported Refurbisher", kind="REFURBISHER",
                zone=zones[0], city="Imported", monthly_capacity_units=6,
                certification_status="UNVERIFIED",
            ),
        ])
        db.flush()

    created = 0
    for _, row in df.iterrows():
        zone = str(row.get("zone") or "Unassigned")
        fleet = _fleet_for(zone)

        months = float(row.get("months_in_service") or 12)
        efc = float(row.get("equivalent_full_cycles") or 300)
        temp = float(row.get("avg_cell_temp_c") or 34)
        dod = float(row.get("depth_of_discharge") or 0.6)
        soh = float(true_soh(np.array([efc]), np.array([temp]), np.array([dod]))[0])

        vid = str(row.get("vehicle_id") or f"IMP-{created:04d}")
        daily_km = float(row.get("daily_km") or 60)
        vehicle = Vehicle(
            vehicle_id=vid,
            model_name=str(row.get("model_name") or "Imported vehicle"),
            fleet_id=fleet.id,
            zone=zone,
            latitude=0.0,
            longitude=0.0,
            in_service_since=NOW - timedelta(days=int(months * 30.4)),
            annual_distance_km=daily_km * 365,
            distance_travelled_km=daily_km * 30.4 * months,
            priority="Standard",
        )
        db.add(vehicle)
        db.flush()

        bid = str(row.get("battery_id") or f"IMP-BAT-{created:04d}")
        battery = Battery(
            battery_uid=f"BLID-IMP-{created:06d}",
            battery_id=bid,
            vehicle_id=vehicle.id,
            chemistry=str(row.get("chemistry") or "NMC"),
            rated_capacity_kwh=float(row.get("rated_capacity_kwh") or 50),
            manufactured_on=NOW - timedelta(days=int(months * 30.4)),
            installed_on=NOW - timedelta(days=max(int(months * 30.4) - 21, 1)),
            current_soh=soh,
            soc_pct=float(row.get("soc_pct") or 60),
            voltage_v=float(row.get("voltage_v") or 390),
            current_a=float(row.get("current_a") or 0),
            temperature_c=temp,
            peak_temperature_c=float(row.get("peak_cell_temp_c") or temp + 8),
            charging_cycles=int(efc),
            charging_events=int(months * 20),
            fast_charge_ratio=float(row.get("fast_charge_ratio") or 0.3),
            energy_delivered_kwh=float(row.get("energy_throughput_kwh") or months * 800),
            dc_resistance_mohm=float(row.get("dc_resistance_mohm") or 20),
            cell_voltage_spread_mv=float(row.get("cell_voltage_spread_mv") or 25),
            measured_capacity_fade_pct=float(row.get("measured_capacity_fade_pct") or 10),
            missing_reading_count=0,
            duplicate_record_count=0,
            invalid_range_count=0,
            outlier_count=0,
            reading_count=IMPORTED_HISTORY_MONTHS,
            history_months=IMPORTED_HISTORY_MONTHS,
            lifecycle_status="IN_SERVICE",
            collection_status="NOT_REQUIRED",
            second_life_status="NOT_ASSESSED",
            recycling_status="NOT_SENT",
            last_inspection_on=None,
            data_source="UPLOADED",
        )
        db.add(battery)
        db.flush()

        throughput = float(row.get("energy_throughput_kwh") or months * 800)
        for m in range(1, IMPORTED_HISTORY_MONTHS + 1):
            frac = m / IMPORTED_HISTORY_MONTHS
            db.add(
                BatteryReading(
                    battery_id=battery.id,
                    month_index=m,
                    recorded_at=NOW - timedelta(days=int((IMPORTED_HISTORY_MONTHS - m) * 30.4)),
                    soh=float(
                        true_soh(
                            np.array([efc * frac]), np.array([temp]), np.array([dod])
                        )[0]
                    ),
                    soc_pct=float(row.get("soc_pct") or 60),
                    voltage_v=float(row.get("voltage_v") or 390),
                    current_a=0.0,
                    temperature_c=temp,
                    charging_cycles=int(efc * frac),
                    energy_delivered_kwh=round(throughput * frac / IMPORTED_HISTORY_MONTHS, 2),
                    distance_km=round(daily_km * 30.4 * (IMPORTED_HISTORY_MONTHS - m), 1),
                )
            )

        db.add(LifecycleEvent(
            battery_id=battery.id, occurred_at=battery.manufactured_on,
            event="MANUFACTURED", location=zone,
            handler="Imported from operator CSV", status="RECORDED",
            evidence_ref=f"IMP-{bid}", actor="upload",
        ))
        db.add(LifecycleEvent(
            battery_id=battery.id, occurred_at=battery.installed_on,
            event="INSTALLED_IN_VEHICLE", location=zone,
            handler="Imported from operator CSV", status="RECORDED",
            evidence_ref=f"IMP-{bid}", actor="upload",
        ))
        created += 1

    db.commit()
    stored = config.UPLOAD_DIR / (filename or "upload.csv")
    stored.write_bytes(df.to_csv(index=False).encode("utf-8"))

    return {
        "status": "accepted",
        "filename": filename,
        "rows_imported": created,
        "rows_dropped_unparseable": coerced,
        "zones": sorted(fleet_objs.keys()),
        "synthesised_history_months": IMPORTED_HISTORY_MONTHS,
        "provenance": {
            "simulated": False,
            "label": "OPERATOR-UPLOADED DATA",
            "sources": ["UPLOADED"],
            "row_count": created,
            "notice": (
                "Rows supplied by an operator via CSV upload. Not validated against a "
                "physical BMS, and the models were trained on synthetic data, so this is "
                "an unverified transfer of that model rather than a measurement."
            ),
        },
        "warning": (
            "The models were trained on synthetic data. Applying them to your CSV is an "
            "unvalidated transfer, not a validated measurement of your batteries. "
            "Retrain on labelled real data before relying on any number."
        ),
        "history_note": (
            f"{IMPORTED_HISTORY_MONTHS} months of history were synthesised from the duty "
            "cycle in your CSV so the trend services have inputs. Those readings are "
            "derived, not observed."
        ),
    }