"""
Recycler API Routes for EVolve AI Circularity Platform.

Provides endpoints for:
  - Recycler dashboard (KPIs: collection required, high priority, EOL, awaiting recycling)
  - Collection queue with priority rankings
  - Collection planning & zone batching
  - Battery status transition: Requested -> Scheduled -> Collected -> Received -> Recycling -> Recycled
  - Traceability audit trail logging
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database.base import get_db
from ..database.models import (
    Battery,
    CollectionBatch,
    CollectionTask,
    CustomerAssessment,
    LifecycleEvent,
    ProcessingHandler,
    RecyclingRecord,
    Vehicle,
)
from ..services import collection as collection_mod, fleet as fleet_mod

router = APIRouter(prefix="/api/recycler", tags=["Recycler"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class StatusUpdateRequest(BaseModel):
    battery_id: str = Field(..., description="Battery ID (e.g. BAT-0012 or BAT-CUST-...)")
    status: str = Field(..., description="Target status: SCHEDULED, COLLECTED, RECEIVED, RECYCLING, RECYCLED")
    notes: str | None = Field(None, description="Optional log note")
    handler: str | None = Field(None, description="Handling facility or operator name")


@router.get("/dashboard")
def get_recycler_dashboard(db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Recycler dashboard summary, collection queue, and processing status.
    """
    all_bats = db.query(Battery).all()

    # Calculate KPIs
    collection_required = 0
    high_priority = 0
    eol_candidates = 0
    awaiting_recycling = 0
    total_recycled = 0

    for b in all_bats:
        if b.lifecycle_status == "EOL_CANDIDATE" or b.collection_status in ["REQUIRED", "SCHEDULED", "PENDING"]:
            collection_required += 1
        if b.lifecycle_status == "EOL_CANDIDATE":
            eol_candidates += 1
        if b.collection_status == "COLLECTED" and b.recycling_status != "RECYCLED":
            awaiting_recycling += 1
        if b.recycling_status == "RECYCLED":
            total_recycled += 1

    tasks = db.query(CollectionTask).all()
    for t in tasks:
        if t.priority_band in ["CRITICAL", "HIGH"] and t.status != "COMPLETED":
            high_priority += 1

    # Build detailed collection queue
    queue_items = []
    # 1. First add from CollectionTask table
    for t in tasks:
        bat = db.query(Battery).filter(Battery.id == t.battery_id).first()
        if not bat:
            continue
        veh = db.query(Vehicle).filter(Vehicle.id == bat.vehicle_id).first()
        loc = veh.zone if veh else "Telangana"
        model_name = veh.model_name if veh else "EV Battery"

        factors_json = {}
        if t.factors:
            try:
                factors_json = json.loads(t.factors)
            except Exception:
                factors_json = {}

        queue_items.append({
            "task_id": t.id,
            "battery_id": bat.battery_id,
            "battery_uid": bat.battery_uid,
            "vehicle_model": model_name,
            "location": loc,
            "chemistry": bat.chemistry,
            "soh_pct": round(bat.current_soh * 100.0, 1),
            "priority_score": round(t.priority_score, 2),
            "priority_band": t.priority_band,
            "status": t.status,
            "collection_status": bat.collection_status,
            "recycling_status": bat.recycling_status,
            "lifecycle_status": bat.lifecycle_status,
            "notes": factors_json.get("reason") or factors_json.get("source") or "EOL flagged",
        })

    # 2. Add customer assessments scheduled for pickup
    cust_ass = db.query(CustomerAssessment).filter(CustomerAssessment.collection_status.in_(["SCHEDULED", "REQUIRED"])).all()
    for c in cust_ass:
        b_id = f"BAT-{c.assessment_id}"
        # avoid duplicate if already in queue_items
        if any(item["battery_id"] == b_id for item in queue_items):
            continue
        queue_items.append({
            "task_id": c.id,
            "battery_id": b_id,
            "battery_uid": c.battery_uid or "BLID-PENDING",
            "vehicle_model": f"{c.vehicle_brand} {c.vehicle_model}",
            "location": f"{c.city}, {c.state}",
            "chemistry": c.battery_chemistry or "LFP",
            "soh_pct": round(c.soh_predicted * 100.0, 1),
            "priority_score": 0.95 if c.soh_predicted < 0.60 else 0.85,
            "priority_band": "CRITICAL" if c.soh_predicted < 0.60 else "HIGH",
            "status": c.collection_status,
            "collection_status": c.collection_status,
            "recycling_status": "NOT_SENT",
            "lifecycle_status": "EOL_CANDIDATE",
            "notes": f"Customer pickup request: {c.collection_contact_name} ({c.collection_preferred_date})",
        })

    # Sort queue by priority score descending
    queue_items.sort(key=lambda x: x["priority_score"], reverse=True)

    # Handlers list
    handlers = db.query(ProcessingHandler).filter(ProcessingHandler.active == True).all()
    handler_list = [
        {
            "id": h.id,
            "handler_id": h.handler_id,
            "name": h.name,
            "kind": h.kind,
            "city": h.city,
            "zone": h.zone,
            "monthly_capacity_units": h.monthly_capacity_units,
            "certification_status": h.certification_status,
        }
        for h in handlers
    ]

    return {
        "kpis": {
            "collection_required": collection_required,
            "high_priority": high_priority,
            "eol_candidates": eol_candidates,
            "awaiting_recycling": awaiting_recycling,
            "total_recycled": total_recycled,
        },
        "queue": queue_items,
        "handlers": handler_list,
    }


@router.post("/update-status")
def update_battery_recycling_status(
    payload: StatusUpdateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Advances a battery through the collection and recycling lifecycle:
    REQUESTED -> SCHEDULED -> COLLECTED -> RECEIVED -> RECYCLING -> RECYCLED
    Appends an immutable audit event to LifecycleEvent.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == payload.battery_id)
        | (Battery.battery_uid == payload.battery_id)
        | (Battery.id == (int(payload.battery_id) if payload.battery_id.isdigit() else -1))
    ).first()

    # Also search by customer assessment ID
    if not bat:
        ass = db.query(CustomerAssessment).filter(
            (CustomerAssessment.assessment_id == payload.battery_id)
            | (f"BAT-{CustomerAssessment.assessment_id}" == payload.battery_id)
        ).first()
        if ass and ass.battery_id:
            bat = db.query(Battery).filter(Battery.id == ass.battery_id).first()

    if not bat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Battery {payload.battery_id} not found in database.",
        )

    st = payload.status.upper()
    handler_name = payload.handler or "Certified EVolve AI Circular Recycler"

    # Update battery states
    if st == "SCHEDULED":
        bat.collection_status = "SCHEDULED"
        bat.lifecycle_status = "EOL_CANDIDATE"
    elif st == "COLLECTED":
        bat.collection_status = "COLLECTED"
        bat.lifecycle_status = "IN_TRANSIT"
    elif st == "RECEIVED":
        bat.collection_status = "DELIVERED"
        bat.recycling_status = "RECEIVED"
        bat.lifecycle_status = "AT_RECYCLER"
    elif st == "RECYCLING":
        bat.recycling_status = "IN_PROCESSING"
        bat.lifecycle_status = "PROCESSING"
    elif st == "RECYCLED":
        bat.recycling_status = "RECYCLED"
        bat.lifecycle_status = "RECYCLED_CLOSED_LOOP"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Must be SCHEDULED, COLLECTED, RECEIVED, RECYCLING, or RECYCLED.",
        )

    # Also update any associated CollectionTask
    task = db.query(CollectionTask).filter(CollectionTask.battery_id == bat.id).first()
    if task:
        if st in ["RECYCLED", "RECYCLING"]:
            task.status = "COMPLETED"
        else:
            task.status = st

    # Record in LifecycleEvent (traceability backbone)
    event_name = f"RECYCLER_{st}"
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event=event_name,
            location=bat.vehicle.zone if bat.vehicle else "Hyderabad Recycling Facility",
            handler=handler_name,
            status=st,
            evidence_ref=f"REC-{bat.battery_id}-{st}",
            actor="recycler",
        )
    )

    db.commit()
    fleet_mod.invalidate()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "new_status": st,
        "message": f"Battery {bat.battery_id} status updated to {st} and logged to circular audit trail.",
    }
