"""
Modules 9 & 10 - Lifecycle Traceability and Environmental Blind-Spot Detection.

Module 9 builds an append-only timeline per battery from `lifecycle_events`,
keyed by the Battery Lifecycle ID (BLID). A database audit trail is sufficient
evidence for a prototype; no blockchain is claimed.

Module 10 looks for records that are environmentally risky precisely because
they are INCOMPLETE - a pack that reached EOL and vanished from the system is
worse than one that was never collected, because nobody is looking for it.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from ..database.models import Battery, BatteryReading, LifecycleEvent, RecyclingRecord

#: Canonical lifecycle order used to flag out-of-sequence or missing steps.
LIFECYCLE_ORDER = [
    "MANUFACTURED",
    "INSTALLED_IN_VEHICLE",
    "ROUTINE_INSPECTION",
    "DEGRADING",
    "INTERVENTION_ASSESSMENT",
    "EOL_CANDIDATE",
    "COLLECTION_SCHEDULED",
    "COLLECTED",
    "TECHNICAL_ASSESSMENT",
    "SECOND_LIFE_ASSIGNED",
    "RECYCLING_RECEIVED",
    "PROCESSED",
]

#: Events a battery that reached EOL should eventually have.
DOWNSTREAM_EVENTS = ["TECHNICAL_ASSESSMENT", "RECYCLING_RECEIVED", "PROCESSED"]

#: Collection considered overdue this many days after it was scheduled.
OVERDUE_AFTER_DAYS = 21


def timeline_for(db, battery: Battery) -> dict[str, Any]:
    """Full lifecycle timeline for one battery."""
    events = (
        db.execute(
            select(LifecycleEvent)
            .where(LifecycleEvent.battery_id == battery.id)
            .order_by(LifecycleEvent.occurred_at)
        )
        .scalars()
        .all()
    )

    readings = (
        db.execute(
            select(BatteryReading)
            .where(BatteryReading.battery_id == battery.id)
            .order_by(BatteryReading.month_index)
        )
        .scalars()
        .all()
    )

    rec = (
        db.execute(
            select(RecyclingRecord)
            .where(RecyclingRecord.battery_id == battery.id)
            .order_by(RecyclingRecord.id)
        )
        .scalars()
        .first()
    )

    vehicle = battery.vehicle

    return {
        "battery_id": battery.battery_id,
        "battery_lifecycle_id": battery.battery_uid,
        "vehicle_id": vehicle.vehicle_id if vehicle else None,
        "zone": vehicle.zone if vehicle else None,
        "current_status": battery.lifecycle_status,
        "collection_status": battery.collection_status,
        "second_life_status": battery.second_life_status,
        "recycling_status": battery.recycling_status,
        "manufactured_on": battery.manufactured_on.isoformat() if battery.manufactured_on else None,
        "installed_on": battery.installed_on.isoformat() if battery.installed_on else None,
        "last_inspection_on": (
            battery.last_inspection_on.isoformat() if battery.last_inspection_on else None
        ),
        "events": [
            {
                "occurred_at": e.occurred_at.isoformat(),
                "event": e.event,
                "location": e.location,
                "handler": e.handler,
                "status": e.status,
                "evidence_ref": e.evidence_ref,
                "actor": e.actor,
            }
            for e in events
        ],
        "event_count": len(events),
        "expected_sequence": LIFECYCLE_ORDER,
        "recycling": (
            {
                "handler_id": rec.handler_id,
                "received_at": rec.received_at.isoformat() if rec.received_at else None,
                "processed_at": rec.processed_at.isoformat() if rec.processed_at else None,
                "material_recovered_pct": rec.material_recovered_pct,
                "route": rec.route,
                "evidence_ref": rec.evidence_ref,
            }
            if rec else None
        ),
        "degradation_series": [
            {
                "month_index": r.month_index,
                "recorded_at": r.recorded_at.isoformat(),
                "soh_pct": round(r.soh * 100, 2) if r.soh is not None else None,
                "temperature_c": r.temperature_c,
                "charging_cycles": r.charging_cycles,
                "distance_km": r.distance_km,
            }
            for r in readings
        ],
        "evidence_note": (
            "This is a database audit trail keyed by Battery Lifecycle ID (BLID). "
            "It is EPR-ready EVIDENCE for internal traceability. It is NOT official "
            "regulatory compliance or certification."
        ),
    }


def _events_map(db, battery_ids: list[int]) -> dict[int, list[LifecycleEvent]]:
    if not battery_ids:
        return {}
    rows = (
        db.execute(
            select(LifecycleEvent)
            .where(LifecycleEvent.battery_id.in_(battery_ids))
            .order_by(LifecycleEvent.occurred_at)
        )
        .scalars()
        .all()
    )
    out: dict[int, list[LifecycleEvent]] = {}
    for r in rows:
        out.setdefault(r.battery_id, []).append(r)
    return out


def detect_blind_spots(db, records: list[dict[str, Any]],
                       decisions: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Module 10 - find environmental blind spots.

    Categories:
      * EOL_CANDIDATE_NOT_SCHEDULED  - reached EOL, no collection task exists
      * COLLECTED_NO_DOWNSTREAM      - collected but no recycling/assessment record
      * OVERDUE_COLLECTION           - scheduled and past the overdue window
      * INCOMPLETE_LIFECYCLE         - gap in the expected event sequence
      * MISSING_ASSESSMENT_EVIDENCE  - no inspection recorded within 12 months
    """
    from .prevention import EOL_CANDIDATE

    pathway = {d["battery_id"]: d["pathway"] for d in decisions}
    batteries = db.query(Battery).all()
    by_id = {b.battery_id: b for b in batteries}
    events = _events_map(db, [b.id for b in batteries])

    recycling_by_batt: dict[int, RecyclingRecord] = {}
    for r in db.query(RecyclingRecord).all():
        recycling_by_batt.setdefault(r.battery_id, r)

    tasks_by_batt: dict[int, Any] = {}
    from ..database.models import CollectionTask

    for t in db.query(CollectionTask).all():
        tasks_by_batt.setdefault(t.battery_id, t)

    now = datetime.now(timezone.utc)
    findings: dict[str, list[dict[str, Any]]] = {
        "EOL_CANDIDATE_NOT_SCHEDULED": [],
        "COLLECTED_NO_DOWNSTREAM": [],
        "OVERDUE_COLLECTION": [],
        "INCOMPLETE_LIFECYCLE": [],
        "MISSING_ASSESSMENT_EVIDENCE": [],
    }

    for b in batteries:
        evs = events.get(b.id, [])
        names = {e.event for e in evs}
        p = pathway.get(b.battery_id)

        # 1) EOL but nothing scheduled
        if p == EOL_CANDIDATE and b.collection_status in ("NOT_SCHEDULED", "PENDING", ""):
            findings["EOL_CANDIDATE_NOT_SCHEDULED"].append(
                {
                    "battery_id": b.battery_id,
                    "battery_lifecycle_id": b.battery_uid,
                    "soh_pct": round(b.current_soh * 100, 1),
                    "issue": "Battery is an EOL candidate but no collection has been scheduled.",
                    "severity": "HIGH",
                    "action": "Create a collection task so this pack enters the queue.",
                }
            )

        # 2) collected, no downstream record
        if b.collection_status == "COLLECTED" and b.id not in recycling_by_batt:
            findings["COLLECTED_NO_DOWNSTREAM"].append(
                {
                    "battery_id": b.battery_id,
                    "battery_lifecycle_id": b.battery_uid,
                    "issue": "Battery was collected but has no recycling or second-life record.",
                    "severity": "CRITICAL",
                    "action": "Confirm the downstream handler and record the outcome.",
                }
            )

        # 3) overdue collection
        t = tasks_by_batt.get(b.id)
        if t and t.scheduled_for and t.status not in ("COLLECTED", "COMPLETED"):
            due = t.scheduled_for
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            if (now - due).days > OVERDUE_AFTER_DAYS:
                findings["OVERDUE_COLLECTION"].append(
                    {
                        "battery_id": b.battery_id,
                        "battery_lifecycle_id": b.battery_uid,
                        "issue": (
                            f"Collection was scheduled {abs((now - due).days)} days ago "
                            f"and is still {t.status}."
                        ),
                        "severity": "HIGH",
                        "action": "Reschedule the collection or record why it is stuck.",
                    }
                )

        # 4) lifecycle gap
        expected_tail = {"MANUFACTURED", "INSTALLED_IN_VEHICLE"}
        if not expected_tail.issubset(names):
            missing = sorted(expected_tail - names)
            findings["INCOMPLETE_LIFECYCLE"].append(
                {
                    "battery_id": b.battery_id,
                    "battery_lifecycle_id": b.battery_uid,
                    "issue": f"Lifecycle history is missing: {', '.join(missing)}.",
                    "severity": "MEDIUM",
                    "action": "Backfill the lifecycle events from available records.",
                }
            )

        # 5) no recent inspection
        if b.last_inspection_on:
            insp = b.last_inspection_on
            if insp.tzinfo is None:
                insp = insp.replace(tzinfo=timezone.utc)
            if (now - insp).days > 365 and p in (EOL_CANDIDATE, "REPAIR_REFURBISHMENT", "SECOND_LIFE_ASSESSMENT"):
                findings["MISSING_ASSESSMENT_EVIDENCE"].append(
                    {
                        "battery_id": b.battery_id,
                        "battery_lifecycle_id": b.battery_uid,
                        "issue": (
                            f"No inspection recorded for {(now - insp).days // 365} year(s) "
                            "on a battery that already needs intervention."
                        ),
                        "severity": "MEDIUM",
                        "action": "Schedule a technical inspection to refresh the evidence.",
                    }
                )

    total = sum(len(v) for v in findings.values())
    per_batt = sum(1 for v in findings.values() for _ in v)
    affected = {x["battery_id"] for v in findings.values() for x in v}

    return {
        "total_findings": total,
        "affected_batteries": len(affected),
        "by_category": {
            k: len(v) for k, v in findings.items()
        },
        "findings": {k: v for k, v in findings.items() if v},
        "headline": (
            f"{len(affected)} batteries require attention"
            if affected else
            "No environmental blind spots detected"
        ),
        "method": (
            "Five deterministic consistency checks over lifecycle_events, "
            "collection_tasks and recycling_records. Each finding names the specific "
            "record that is missing."
        ),
        "why_it_matters": (
            "A pack that reached end of life and then vanished from the system is worse "
            "than one that was never collected, because nobody is looking for it."
        ),
    }