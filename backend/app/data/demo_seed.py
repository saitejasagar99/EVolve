"""
Synthetic demo dataset for EVolve AI.

=============================================================================
SYNTHETIC DATA NOTICE
=============================================================================
Every value produced here is SYNTHETIC. Batteries, readings, lifecycle events
and handler capacities are generated from documented rules so the platform has
a reproducible dataset to demonstrate against.

This is NOT measured battery data. No claim is made that a model trained on it
will perform the same way on a real fleet.

Upload a real CSV via POST /api/data/upload to analyse operator-supplied data.
=============================================================================

Ground truth
------------
`soh` is produced by an explicit, documented degradation law:

    SOH = 1 - (0.00075 * EFC^0.85 + 0.006 * exp(0.017*(T-25)) + 0.0009*DoD^1.2)

BMS-reported values are then deliberately NOISY (capacity-fade estimator error,
averaged temperature that hides excursions), because a real BMS never reports
exact values. That noise is what keeps the ML task non-trivial.

IMPORTANT CONSEQUENCE, stated up front: because the features fed to the model
almost determine the label, cross-validated R2 approaches 1.0. That is a
property of the data-generating process, NOT evidence of real-world accuracy.
The API and UI both say so, and a BMS-noise robustness ablation is published
alongside the headline numbers.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone

import numpy as np

from .. import config
from ..database.models import (
    Anomaly,
    Battery,
    BatteryReading,
    Fleet,
    LifecycleEvent,
    ProcessingHandler,
    Vehicle,
)

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)

CHEMISTRY = ["NMC", "LFP"]
VEHICLE_MODELS = [
    ("eSwift City", 45.0, 320),
    ("eSwift Fleet", 58.0, 340),
    ("Voltron Mini", 32.0, 210),
    ("Voltron Pro", 74.0, 410),
    ("Zephyr EV-X", 52.0, 355),
    ("Zephyr EV-L", 38.0, 260),
]

#: Depot zones with plausible coordinates (Hyderabad metro, illustrative).
ZONES = [
    ("Hyderabad North", 17.4400, 78.3480),
    ("Hyderabad South", 17.3200, 78.4400),
    ("Hyderabad East", 17.3800, 78.5500),
    ("Hyderabad West", 17.4100, 78.2600),
    ("Rangareddy", 17.3300, 78.2700),
    ("Medchal", 17.3100, 78.5900),
]

SIM_NOTICE = (
    "SYNTHETIC DEMO DATA - generated from documented rules. Not measured battery data. "
    "Upload your own CSV for operator data."
)


# ---------------------------------------------------------------------------
# Ground-truth degradation law
# ---------------------------------------------------------------------------

def true_soh(efc: np.ndarray | float, temp_c: np.ndarray | float,
             dod: np.ndarray | float) -> np.ndarray | float:
    """Documented degradation law used to LABEL the synthetic dataset."""
    cycle = 0.00075 * np.power(np.maximum(efc, 0.0), 0.85)
    calendar = 0.006 * np.exp(0.017 * np.maximum(np.asarray(temp_c) - 25.0, 0.0))
    dod_term = 0.0009 * np.power(np.clip(dod, 0.05, 1.0), 1.2)
    return np.clip(1.0 - (cycle + calendar + dod_term), 0.28, 1.0)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Row specification (framework-agnostic, so it is testable without a DB)
# ---------------------------------------------------------------------------

def build_battery_specs(n: int = config.DEMO_FLEET_COUNT,
                        seed: int = config.RANDOM_SEED,
                        anomaly_rate: float | None = None) -> list[dict]:
    """
    Build the deterministic demo battery specifications.

    The mix is deliberately engineered to exercise every downstream engine:
    healthy, degrading, anomaly candidates, repair candidates, second-life
    candidates, EOL candidates, overdue collection and traceability gaps.
    """
    rng = np.random.default_rng(seed)

    # A forced mix guarantees the demo always tells the whole waste story,
    # rather than whatever a random draw happens to produce.
    forced = [
        "healthy", "healthy", "healthy", "healthy", "healthy",
        "degrading", "degrading", "degrading", "degrading",
        "repair", "repair", "repair",
        "second_life", "second_life", "second_life",
        "eol", "eol", "eol", "eol", "eol",
    ]
    kinds: list[str] = list(forced)
    while len(kinds) < n:
        kinds.append(str(rng.choice(["healthy", "healthy", "degrading", "degrading"], p=[0.35, 0.35, 0.2, 0.1])))
    kinds = kinds[:n]

    #: Probability of a genuine thermal/electrical signal, per archetype.
    #: Degraded packs carry faults far more often than healthy ones.
    ANOMALY_RATE_BY_ARCHETYPE = {
        "healthy": 0.03,
        "degrading": 0.10,
        "repair": 0.18,
        "second_life": 0.34,
        "eol": 0.42,
    }

    # Target SOH band per archetype so the prevention engine has work to do.
    band = {
        "healthy": (0.86, 0.99),
        "degrading": (0.72, 0.86),
        "repair": (0.62, 0.76),
        "second_life": (0.48, 0.66),
        "eol": (0.26, 0.54),
    }

    specs: list[dict] = []
    for i, kind in enumerate(kinds, start=1):
        # Batteries are grouped into zones CONTIGUOUSLY, not round-robin, so a
        # zone holds a realistic cluster. Round-robin spreads one pack per zone,
        # which makes geographic batching meaningless.
        zone_idx = min((i - 1) // 9, len(ZONES) - 1)
        zone_name, zlat, zlon = ZONES[zone_idx]
        model_name, rated_kwh, rated_range = VEHICLE_MODELS[i % len(VEHICLE_MODELS)]
        chem = CHEMISTRY[i % len(CHEMISTRY)]

        # Keep jitter small relative to inter-zone separation so packs stay
        # inside their own zone on the schematic map.
        spread = 0.016

        lo, hi = band[kind]
        # Beta distribution keeps values inside the band without piling on the edge.
        target_soh = float(rng.beta(2.0, 2.0) * (hi - lo) + lo)

        # Back-solve equivalent full cycles that produce this SOH at a typical
        # Indian metro temperature (~34 C) and moderate depth of discharge.
        temp_c = float(np.clip(rng.normal(34, 5), 22, 52))
        dod = float(np.clip(rng.normal(0.62, 0.15), 0.25, 0.95))
        remaining = 1.0 - target_soh
        fixed = 0.006 * math.exp(0.017 * max(temp_c - 25.0, 0.0)) + 0.0009 * (dod ** 1.2)
        cyc_term = max(remaining - fixed, 1e-4)
        efc = float((cyc_term / 0.00075) ** (1 / 0.85))

        energy_per_km = rated_kwh / rated_range
        months = float(np.clip(rng.gamma(2.1, 15.0), 4, 96))
        daily_km = float(np.clip(rng.normal(78, 34), 10, 240))
        efc_month = max(daily_km * energy_per_km / rated_kwh * 30.4, 0.05)

        # --- BMS snapshot with realistic measurement error ---
        soh = float(true_soh(efc, temp_c, dod))
        measured_fade = float(np.clip((1.0 - soh) * 100 + rng.normal(0, 1.2), 0.5, 72.0))
        fast_ratio = float(np.clip(rng.beta(2.0, 3.4), 0.0, 1.0))
        ambient = float(np.clip(temp_c - rng.uniform(6, 16), 16, 46))
        peak_temp = float(np.clip(temp_c + rng.gamma(2.0, 2.6), temp_c, 78))

        anomaly_kind = None
        anomaly_sev = 0.0
        # The rate is applied WITHIN each archetype rather than uniformly, so a
        # healthy pack is rarely anomalous and a degraded one often is - which
        # is how real thermal/electrical faults actually appear.
        rate = (
            anomaly_rate if anomaly_rate is not None
            else ANOMALY_RATE_BY_ARCHETYPE.get(kind, 0.0)
        )
        if rate > 0 and rng.random() < rate:
            anomaly_kind = str(rng.choice(["thermal_excursion", "cell_imbalance", "voltage_sag"]))
            anomaly_sev = float(rng.uniform(0.5, 0.95))
            peak_temp = float(np.clip(peak_temp + rng.uniform(9, 24), 40, 96))

        # --- data-quality defects, so Module 1 has real findings ---
        n_readings = int(np.clip(rng.integers(6, 37), 4, 36))
        missing = int(max(rng.poisson(1.4 if n_readings < 12 else 0.4), 0))
        duplicates = int(rng.poisson(0.25)) if rng.random() < 0.35 else 0
        invalid = int(rng.poisson(0.3)) if rng.random() < 0.3 else 0
        outliers = int(rng.poisson(0.5)) if rng.random() < 0.4 else 0

        # Group batteries into zones CONTIGUOUSLY rather than round-robin, so a
        # zone holds a realistic cluster of packs. Round-robin spreads one pack
        # per zone, which makes geographic batching meaningless.
        zone_idx = min((i - 1) // 9, len(ZONES) - 1)
        zone_name, zlat, zlon = ZONES[zone_idx]
        model_name, rated_kwh, rated_range = VEHICLE_MODELS[i % len(VEHICLE_MODELS)]
        chem = CHEMISTRY[i % len(CHEMISTRY)]

        # Jitter must be small relative to the inter-zone separation so packs
        # stay inside their own zone on the schematic map.
        spread = 0.018 if len(ZONES) > 1 else 0.0

        specs.append(
            {
                "battery_id": f"BAT-{i:04d}",
                "battery_uid": f"BLID-IN-{i:06d}",
                "vehicle_id": f"EV-{i:03d}",
                "model_name": model_name,
                "chemistry": chem,
                "rated_capacity_kwh": rated_kwh,
                "rated_range_km": rated_range,
                "zone": zone_name,
                "latitude": zlat + float(rng.normal(0, spread)),
                "longitude": zlon + float(rng.normal(0, spread)),
                "months_in_service": months,
                "daily_km": daily_km,
                "equivalent_full_cycles": efc,
                "efc_month": efc_month,
                "energy_per_km": energy_per_km,
                "true_soh": soh,
                "ambient_c": ambient,
                "avg_cell_temp_c": temp_c,
                "peak_cell_temp_c": peak_temp,
                "measured_capacity_fade_pct": measured_fade,
                "fast_charge_ratio": fast_ratio,
                "depth_of_discharge": dod,
                "soc_pct": float(np.clip(rng.normal(62, 22), 6, 100)),
                "voltage_v": float(np.clip(rng.normal(392, 6), 340, 415)),
                "current_a": float(np.clip(rng.normal(0, 90), -260, 260)),
                "dc_resistance_mohm": float(np.clip(11 + 105 * (1 - soh) * 2 + rng.normal(0, 2.5), 8, 80)),
                "cell_voltage_spread_mv": float(np.clip(14 + 210 * (1 - soh) + rng.normal(0, 7), 3, 130)),
                "anomaly_kind": anomaly_kind,
                "anomaly_severity": anomaly_sev,
                "archetype": kind,
                "reading_count": n_readings,
                "missing_readings": missing,
                "duplicate_records": duplicates,
                "invalid_ranges": invalid,
                "outliers": outliers,
                "priority": str(rng.choice(["Standard", "Standard", "Critical"], p=[0.7, 0.2, 0.1])),
                "manufactured_on": NOW - timedelta(days=int(months * 30.4) + int(rng.integers(5, 70))),
            }
        )

    return specs


def _history_for(spec: dict, rng: np.random.Generator) -> list[dict]:
    """Build the monthly reading series, walking forward to the current state."""
    n = spec["reading_count"]
    efc_end = spec["equivalent_full_cycles"]
    efc_step = efc_end / max(n, 1)
    temp_end = spec["avg_cell_temp_c"]
    temp_drift = float(rng.normal(0.03, 0.5))
    out: list[dict] = []

    for k in range(n):
        frac = (k + 1) / n
        efc = efc_end * frac
        temp = float(np.clip(temp_end + temp_drift * (n - k) + rng.normal(0, 1.6), 18, 68))
        soh = float(true_soh(efc, temp, spec["depth_of_discharge"]))
        out.append(
            {
                "month_index": k + 1,
                "recorded_at": NOW - timedelta(days=int((n - k) * 30.4)),
                "soh": round(soh, 5),
                "soc_pct": float(np.clip(rng.normal(64, 20), 5, 100)),
                "voltage_v": float(np.clip(rng.normal(392, 7), 340, 415)),
                "current_a": float(np.clip(rng.normal(0, 85), -250, 250)),
                "temperature_c": round(temp, 2),
                "charging_cycles": int(round(spec["equivalent_full_cycles"] * 0.92 * frac)),
                "energy_delivered_kwh": round(spec["rated_capacity_kwh"] * frac * 0.85, 2),
                "distance_km": round(spec["daily_km"] * 30.4 * (n - k), 1),
            }
        )
    return out


def seed_demo(db, n: int = config.DEMO_FLEET_COUNT, reset: bool = True) -> dict:
    """
    Populate the database with the deterministic synthetic demo fleet.

    Deterministic: the same seed always produces the same batteries, so a jury
    sees identical numbers on every run.
    """
    from ..database.base import reset_db

    if reset:
        reset_db()

    rng = np.random.default_rng(config.RANDOM_SEED + 7)
    specs = build_battery_specs(n)

    # --- fleets ---
    fleet_objs: dict[str, Fleet] = {}
    for zname, _, _ in ZONES:
        code = zname.split()[-1]
        f = Fleet(
            fleet_id=f"FLEET-{code.upper()[:4]}",
            name=f"{zname} EV Fleet",
            operator_name="Regional EV Logistics Operator",
            zone=zname,
            city="Hyderabad",
            priority="Critical" if zname in ("Hyderabad North", "Medchal") else "Standard",
        )
        db.add(f)
        fleet_objs[zname] = f
    db.flush()

    # --- downstream handlers ---
    handlers_spec = [
        ("HND-01", "Northgate Battery Recovery", "RECYCLER", "Hyderabad North", 14, "VERIFIED"),
        ("HND-02", "Deccan Cell Reclamation", "RECYCLER", "Hyderabad South", 11, "VERIFIED"),
        ("HND-03", "Vega Second-Life Works", "REFURBISHER", "Hyderabad East", 8, "VERIFIED"),
        ("HND-04", "Rangareddy Scrap Traders", "RECYCLER", "Rangareddy", 6, "UNVERIFIED"),
        ("HND-05", "Medchal Aggregators", "RECYCLER", "Medchal", 5, "UNVERIFIED"),
    ]
    handler_objs = []
    for hid, name, kind, zone, cap, cert in handlers_spec:
        h = ProcessingHandler(
            handler_id=hid, name=name, kind=kind, zone=zone, city="Hyderabad",
            monthly_capacity_units=cap, certification_status=cert,
        )
        db.add(h)
        handler_objs.append(h)
    db.flush()

    # --- vehicles + batteries ---
    created = 0
    for idx, spec in enumerate(specs, start=1):
        vehicle = Vehicle(
            vehicle_id=spec["vehicle_id"],
            model_name=spec["model_name"],
            fleet_id=fleet_objs[spec["zone"]].id,
            zone=spec["zone"],
            latitude=spec["latitude"],
            longitude=spec["longitude"],
            in_service_since=spec["manufactured_on"] + timedelta(days=21),
            annual_distance_km=round(spec["daily_km"] * 365, 1),
            distance_travelled_km=round(spec["daily_km"] * 30.4 * spec["months_in_service"], 1),
            priority=spec["priority"],
        )
        db.add(vehicle)
        db.flush()

        months = spec["months_in_service"]
        # Deterministic sharing status distribution for realistic circular demo pipeline
        demo_sharing_status = "PRIVATE"
        demo_sharing_consent = False
        demo_sl_suitability = "Not evaluated"
        if idx % 6 == 0:
            demo_sharing_consent = True
            demo_sharing_status = "PENDING_ASSESSMENT"
        elif idx % 6 == 1 and 0.55 <= spec["true_soh"] < 0.80:
            demo_sharing_consent = True
            demo_sharing_status = "APPROVED_FOR_SECOND_LIFE"
            demo_sl_suitability = "High"
        elif (idx % 6 == 1 and spec["true_soh"] < 0.55) or (idx % 6 == 2 and spec["true_soh"] < 0.70):
            demo_sharing_consent = True
            demo_sharing_status = "APPROVED_FOR_RECYCLING"
            demo_sl_suitability = "Unsuitable"
        elif idx % 6 == 3 and spec["true_soh"] < 0.65:
            demo_sharing_consent = True
            demo_sharing_status = "COLLECTION_REQUESTED"
        elif idx % 6 == 4 and spec["true_soh"] < 0.60:
            demo_sharing_consent = True
            demo_sharing_status = "PROCESSING"
        elif idx % 6 == 5 and spec["true_soh"] < 0.55:
            demo_sharing_consent = True
            demo_sharing_status = "RECOVERY_COMPLETED"

        full_model = spec["model_name"]
        brand_guess = full_model.split()[0] if " " in full_model else "Tata"

        battery = Battery(
            battery_uid=spec["battery_uid"],
            battery_id=spec["battery_id"],
            vehicle_id=vehicle.id,
            vehicle_manufacturer=brand_guess,
            vehicle_model=full_model,
            purchase_year=spec["manufactured_on"].year,
            odometer_km=round(spec["daily_km"] * 30.4 * spec["months_in_service"], 1),
            city="Hyderabad",
            state="Telangana",
            chemistry=spec["chemistry"],
            rated_capacity_kwh=spec["rated_capacity_kwh"],
            manufactured_on=spec["manufactured_on"],
            installed_on=vehicle.in_service_since,
            warranty_years=8,
            current_soh=spec["true_soh"],
            soc_pct=spec["soc_pct"],
            voltage_v=spec["voltage_v"],
            current_a=spec["current_a"],
            temperature_c=spec["avg_cell_temp_c"],
            peak_temperature_c=spec["peak_cell_temp_c"],
            charging_cycles=int(spec["equivalent_full_cycles"] * 0.92),
            charging_events=int(months * 22),
            fast_charge_ratio=spec["fast_charge_ratio"],
            energy_delivered_kwh=round(spec["rated_capacity_kwh"] * months * 0.85, 1),
            dc_resistance_mohm=spec["dc_resistance_mohm"],
            cell_voltage_spread_mv=spec["cell_voltage_spread_mv"],
            measured_capacity_fade_pct=spec["measured_capacity_fade_pct"],
            missing_reading_count=spec["missing_readings"],
            duplicate_record_count=spec["duplicate_records"],
            invalid_range_count=spec["invalid_ranges"],
            outlier_count=spec["outliers"],
            reading_count=spec["reading_count"],
            history_months=int(spec["reading_count"]),
            lifecycle_status="IN_SERVICE" if demo_sharing_status != "PROCESSING" and demo_sharing_status != "RECOVERY_COMPLETED" else "EOL_CANDIDATE",
            collection_status="NOT_REQUIRED" if demo_sharing_status not in ("COLLECTION_REQUESTED", "PROCESSING", "RECOVERY_COMPLETED") else "SCHEDULED",
            second_life_status="ASSESSED_SUITABLE" if demo_sharing_status == "APPROVED_FOR_SECOND_LIFE" else "NOT_ASSESSED",
            second_life_suitability=demo_sl_suitability,
            recycling_status="APPROVED" if demo_sharing_status in ("APPROVED_FOR_RECYCLING", "PROCESSING", "RECOVERY_COMPLETED") else "NOT_SENT",
            sharing_status=demo_sharing_status,
            sharing_consent=demo_sharing_consent,
            last_inspection_on=NOW - timedelta(days=int(rng.integers(20, 260))),
            data_source="SIMULATED",
        )
        db.add(battery)
        db.flush()

        # --- readings ---
        for r in _history_for(spec, rng):
            db.add(
                BatteryReading(
                    battery_id=battery.id,
                    month_index=r["month_index"],
                    recorded_at=r["recorded_at"],
                    soh=r["soh"], soc_pct=r["soc_pct"], voltage_v=r["voltage_v"],
                    current_a=r["current_a"], temperature_c=r["temperature_c"],
                    charging_cycles=r["charging_cycles"],
                    energy_delivered_kwh=r["energy_delivered_kwh"],
                    distance_km=r["distance_km"],
                )
            )

        # --- lifecycle trail ---
        db.add(LifecycleEvent(
            battery_id=battery.id, occurred_at=battery.manufactured_on,
            event="MANUFACTURED", location=f"{spec['zone']} (plant inbound)",
            handler="OEM Cell Supplier", status="RECORDED",
            evidence_ref=f"MFG-{spec['battery_id']}",
        ))
        db.add(LifecycleEvent(
            battery_id=battery.id, occurred_at=battery.installed_on,
            event="INSTALLED_IN_VEHICLE", location=spec["zone"],
            handler=spec["model_name"] + " OEM", status="RECORDED",
            evidence_ref=f"INST-{spec['battery_id']}",
        ))
        db.add(LifecycleEvent(
            battery_id=battery.id, occurred_at=battery.last_inspection_on,
            event="ROUTINE_INSPECTION", location=spec["zone"],
            handler="Fleet Maintenance Team", status="RECORDED",
            evidence_ref=f"INS-{spec['battery_id']}",
        ))

        if spec["anomaly_kind"]:
            db.add(Anomaly(
                battery_id=battery.id,
                detected_at=NOW - timedelta(days=int(rng.integers(5, 90))),
                kind=spec["anomaly_kind"],
                severity=spec["anomaly_severity"],
                evidence=(
                    f"Potential {spec['anomaly_kind'].replace('_', ' ')} signal. "
                    "Flagged for technical inspection; not a confirmed fault."
                ),
                status="TECHNICAL_REVIEW",
            ))

        # ---------------- downstream lifecycle story ----------------
        # Batteries that have already travelled partway through the circularity
        # chain, so traceability, collection and recycling modules have real
        # records to work with rather than an all-in-service fleet.
        stage = _downstream_stage(spec["archetype"], idx)
        if stage:
            _seed_downstream(db, battery, spec, vehicle, stage, rng)

        created += 1

    # Seed demo users for authentication and role workflows
    _seed_demo_users(db)

    db.flush()
    return {"batteries": created, "vehicles": len(specs), "fleets": len(fleet_objs),
            "handlers": len(handler_objs), "notice": SIM_NOTICE}


def _seed_demo_users(db) -> None:
    """Seed hackathon demo accounts (customer, consumer, recycler, admin)."""
    from ..database.models import User, UserVehicle
    from ..services.auth import hash_password, validate_and_tokenize_aadhaar

    demo_accounts = [
        {
            "full_name": "Sai Teja",
            "username": "sai_teja",
            "email": "customer@evolve.ai",
            "phone": "+91 98765 43210",
            "role": "CUSTOMER",
            "aadhaar": "9876 5432 1098",
            "vehicle": {
                "vehicle_number": "TS09AB1234",
                "manufacturer": "Tata",
                "model": "Nexon EV",
                "purchase_year": 2023,
                "odometer_km": 42000.0,
                "city": "Hyderabad",
                "state": "Telangana",
                "pincode": "500081",
            },
        },
        {
            "full_name": "Aditi Rao",
            "username": "aditi_rao",
            "email": "consumer@evolve.ai",
            "phone": "+91 98765 43211",
            "role": "CONSUMER",
            "aadhaar": None,
            "vehicle": None,
        },
        {
            "full_name": "Vikram Sharma",
            "username": "vikram_sharma",
            "email": "recycler@evolve.ai",
            "phone": "+91 98765 43212",
            "role": "RECYCLER",
            "aadhaar": None,
            "vehicle": None,
        },
        {
            "full_name": "System Administrator",
            "username": "admin_evolve",
            "email": "admin@evolve.ai",
            "phone": "+91 98765 43213",
            "role": "ADMIN",
            "aadhaar": None,
            "vehicle": None,
        },
    ]

    for acc in demo_accounts:
        existing = db.query(User).filter(
            (User.email == acc["email"]) | (User.username == acc["username"])
        ).first()
        if existing:
            continue

        _, enc_aadhaar, last4, _ = validate_and_tokenize_aadhaar(acc["aadhaar"])
        user = User(
            full_name=acc["full_name"],
            username=acc["username"],
            email=acc["email"],
            phone=acc["phone"],
            aadhaar_encrypted=enc_aadhaar,
            aadhaar_last4=last4,
            password_hash=hash_password("Evolve@2026"),
            email_verified=True,
            role=acc["role"],
        )
        db.add(user)
        db.flush()

        if acc["vehicle"]:
            veh_info = acc["vehicle"]
            uv = UserVehicle(
                user_id=user.id,
                vehicle_number=veh_info["vehicle_number"],
                manufacturer=veh_info["manufacturer"],
                model=veh_info["model"],
                purchase_year=veh_info["purchase_year"],
                odometer_km=veh_info["odometer_km"],
                city=veh_info["city"],
                state=veh_info["state"],
                pincode=veh_info["pincode"],
            )
            db.add(uv)
            db.flush()


#: Downstream lifecycle stages, in order.
STAGE_EOL = "EOL_CANDIDATE"
STAGE_SCHEDULED = "COLLECTION_SCHEDULED"
STAGE_COLLECTED = "COLLECTED"
STAGE_RECYCLED = "RECYCLED"


def _downstream_stage(archetype: str, index: int) -> str | None:
    """
    Decide how far through the waste chain each pack has already travelled.

    Deterministic and archetype-aware, so the demo always demonstrates overdue
    collections, missing downstream records and completed recycling.
    """
    if archetype == "eol":
        if index % 4 == 0:
            return STAGE_RECYCLED
        if index % 4 == 1:
            return STAGE_COLLECTED
        if index % 4 == 2:
            return STAGE_SCHEDULED
        return STAGE_EOL          # the unscheduled gap the UI must surface
    if archetype == "second_life" and index % 3 == 0:
        return STAGE_SCHEDULED
    return None


def _seed_downstream(db, battery, spec: dict, vehicle, stage: str, rng) -> None:
    """
    Write the lifecycle events, collection task and recycling record for a pack
    that has moved past in-service.

    Some records are deliberately left INCOMPLETE (e.g. collected without a
    recycling record) because Module 10 exists to detect exactly those gaps.
    """
    from ..database.models import CollectionTask, RecyclingRecord

    now = NOW
    eol_at = now - timedelta(days=int(rng.integers(20, 150)))
    zone = spec["zone"]

    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=eol_at, event="DEGRADING",
        location=zone, handler="Telemetry pipeline", status="RECORDED",
        evidence_ref=f"DEG-{battery.battery_id}",
    ))
    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=eol_at + timedelta(days=3),
        event="EOL_CANDIDATE", location=zone,
        handler="EVolve AI prevention engine", status="RECORDED",
        evidence_ref=f"EOL-{battery.battery_id}",
    ))

    if stage == STAGE_EOL:
        battery.lifecycle_status = "EOL_CANDIDATE"
        battery.collection_status = "NOT_SCHEDULED"
        # No collection task on purpose -> a blind spot the UI must show.
        return

    sched_at = eol_at + timedelta(days=6)
    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=sched_at, event="COLLECTION_SCHEDULED",
        location=zone, handler="Fleet reverse-logistics team", status="RECORDED",
        evidence_ref=f"COL-{battery.battery_id}",
    ))
    battery.lifecycle_status = "EOL_CANDIDATE"
    battery.collection_status = "SCHEDULED"

    overdue = stage == STAGE_SCHEDULED and (index_overdue(spec))
    task = CollectionTask(
        battery_id=battery.id,
        priority_score=70.0,
        priority_band="HIGH",
        status="PENDING",
        scheduled_for=sched_at if overdue else now + timedelta(days=int(rng.integers(5, 40))),
        factors='{"note": "seeded demo record"}',
    )
    db.add(task)
    db.flush()

    if stage == STAGE_SCHEDULED:
        return

    coll_at = sched_at + timedelta(days=int(rng.integers(3, 15)))
    task.status = "COLLECTED"
    task.collected_at = coll_at
    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=coll_at, event="COLLECTED",
        location=zone, handler="Authorised collection agent", status="RECORDED",
        evidence_ref=f"CLL-{battery.battery_id}",
    ))
    battery.lifecycle_status = "COLLECTED"
    battery.collection_status = "COLLECTED"

    if stage == STAGE_COLLECTED:
        # Deliberately no recycling record -> COLLECTED_NO_DOWNSTREAM blind spot.
        battery.recycling_status = "NOT_SENT"
        return

    handlers = db.query(ProcessingHandler).order_by(ProcessingHandler.id).all()
    handler = next((h for h in handlers if h.kind == "RECYCLER"), None)
    recv_at = coll_at + timedelta(days=int(rng.integers(2, 20)))
    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=recv_at, event="TECHNICAL_ASSESSMENT",
        location=handler.zone if handler else zone,
        handler=handler.name if handler else "Downstream assessment",
        status="RECORDED", evidence_ref=f"TEC-{battery.battery_id}",
    ))
    proc_at = recv_at + timedelta(days=int(rng.integers(3, 18)))
    db.add(LifecycleEvent(
        battery_id=battery.id, occurred_at=proc_at, event="PROCESSED",
        location=handler.zone if handler else zone,
        handler=handler.name if handler else "Downstream processor",
        status="RECORDED", evidence_ref=f"PRC-{battery.battery_id}",
    ))
    db.add(RecyclingRecord(
        battery_id=battery.id, handler_id=handler.id if handler else None,
        received_at=recv_at, processed_at=proc_at,
        material_recovered_pct=round(float(rng.uniform(88, 97)), 1),
        route="RECYCLE", evidence_ref=f"REC-{battery.battery_id}",
    ))
    battery.lifecycle_status = "PROCESSED"
    battery.recycling_status = "PROCESSED"


def index_overdue(spec: dict) -> bool:
    """Roughly half of the scheduled packs are overdue, deterministically."""
    return int(spec["battery_id"].split("-")[-1]) % 2 == 0


def required_columns() -> list[str]:
    """Columns an uploaded CSV must provide."""
    return [
        "battery_id", "vehicle_id", "chemistry", "rated_capacity_kwh",
        "months_in_service", "daily_km", "equivalent_full_cycles",
        "avg_charge_rate_c", "fast_charge_ratio", "depth_of_discharge",
        "ambient_temp_c", "avg_cell_temp_c", "peak_cell_temp_c",
        "cell_voltage_spread_mv", "dc_resistance_mohm",
        "measured_capacity_fade_pct",
    ]


def upload_template_frame():
    """A correctly-shaped DataFrame for operators to edit."""
    import pandas as pd

    specs = build_battery_specs(12)
    rows = []
    for s in specs:
        rows.append({
            "battery_id": s["battery_id"], "vehicle_id": s["vehicle_id"],
            "chemistry": s["chemistry"], "rated_capacity_kwh": s["rated_capacity_kwh"],
            "months_in_service": round(s["months_in_service"], 1),
            "daily_km": s["daily_km"],
            "equivalent_full_cycles": round(s["equivalent_full_cycles"], 1),
            "avg_charge_rate_c": 1.1, "fast_charge_ratio": s["fast_charge_ratio"],
            "depth_of_discharge": s["depth_of_discharge"],
            "ambient_temp_c": round(s["ambient_c"], 2),
            "avg_cell_temp_c": round(s["avg_cell_temp_c"], 2),
            "peak_cell_temp_c": round(s["peak_cell_temp_c"], 2),
            "cell_voltage_spread_mv": s["cell_voltage_spread_mv"],
            "dc_resistance_mohm": s["dc_resistance_mohm"],
            "measured_capacity_fade_pct": s["measured_capacity_fade_pct"],
            "zone": s["zone"],
        })
    return pd.DataFrame(rows)