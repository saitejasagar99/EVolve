"""
Battery Recycling & Recovery Shared API Routes.

Connects EV Owner records to the Battery Recycling & Recovery interface.
Enforces strict role-based access and data privacy:
  - EV Owners control sharing consent (PRIVATE by default).
  - Shared views only surface non-private, consented battery records.
  - Identifying personal information (names, emails, phones, vehicle license plates)
    is strictly stripped from public shared views.
  - Recyclers and Admins have operational privileges to update assessment, collection,
    and recovery statuses.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database.base import get_db
from ..database.models import (
    Battery,
    BatteryDisposalReport,
    BatteryEnquiry,
    CollectionTask,
    LifecycleEvent,
    User,
    Vehicle,
)
from ..services.auth import get_current_user, get_optional_current_user, require_role

logger = logging.getLogger("evolve.recycling")

router = APIRouter(prefix="/api/recycling", tags=["Battery Recycling & Recovery"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class BatteryEnquiryCreateRequest(BaseModel):
    enquiry_purpose: str = Field(..., description="Research / Second-life project / Commercial repurposing / Recycling / General")
    intended_application: str | None = Field(default=None, description="Intended application if second-life")
    message: str | None = Field(default=None, description="Inquiry details or questions")


class RecyclingAssessmentRequest(BaseModel):
    outcome: str = Field(
        ...,
        description="Assessment outcome: APPROVED_FOR_SECOND_LIFE, APPROVED_FOR_RECYCLING, or CONTINUE_USE",
    )
    notes: str | None = Field(default=None, description="Diagnostic notes from testing facility")
    tested_soh: float | None = Field(default=None, ge=0.0, le=1.0, description="Measured SOH fraction (0.0 to 1.0)")


class RecyclingCollectionRequest(BaseModel):
    action: str = Field(
        ...,
        description="Collection action: CONFIRM_PICKUP, MARK_COLLECTED, or DELIVERED_TO_FACILITY",
    )
    notes: str | None = Field(default=None, description="Logistics and handling notes")


class RecyclingStatusUpdateRequest(BaseModel):
    status: str = Field(
        ...,
        description="Updated lifecycle status: PROCESSING or RECOVERY_COMPLETED",
    )
    material_recovered_pct: float | None = Field(
        default=None, ge=0.0, le=100.0, description="Critical mineral recovery rate percentage"
    )
    notes: str | None = Field(default=None, description="Processing facility notes")


# ---------------------------------------------------------------------------
# Helper: Privacy Sanitization
# ---------------------------------------------------------------------------

def _sanitize_shared_battery(battery: Battery, is_authorized_handler: bool = False) -> dict[str, Any]:
    """
    Format a battery record for the Battery Recycling & Recovery interface.
    Strips all personal identifiable information (PII) for viewers.
    """
    soh_pct = round(battery.current_soh * 100.0, 1) if battery.current_soh is not None else None
    usable_kwh = (
        round(battery.rated_capacity_kwh * (soh_pct / 100.0), 1)
        if (battery.rated_capacity_kwh and soh_pct)
        else None
    )

    # Approximate regional location only (no street address or pincode)
    approx_area = f"{battery.city or 'Regional'}, {battery.state or 'India'}"

    # Determine recommended next step based on real status
    next_step = "Awaiting authorized diagnostic assessment"
    if battery.sharing_status == "APPROVED_FOR_SECOND_LIFE":
        next_step = "Suitable for stationary storage test & repurposing"
    elif battery.sharing_status == "APPROVED_FOR_RECYCLING":
        next_step = "Schedule authorized hazardous battery pickup"
    elif battery.sharing_status == "COLLECTION_REQUESTED":
        next_step = "Collection request recorded; awaiting transporter assignment"
    elif battery.sharing_status == "COLLECTED":
        next_step = "In transit to registered recycling center"
    elif battery.sharing_status == "PROCESSING":
        next_step = "Disassembly & hydrometallurgical mineral extraction in progress"
    elif battery.sharing_status == "RECOVERY_COMPLETED":
        next_step = "Closed-loop critical mineral recovery verified"

    # Category label
    category = "Traction Battery Pack"
    if battery.chemistry:
        category = f"{battery.chemistry} EV Battery Pack"

    # Pathway badge
    pathway_badge = "AWAITING_ASSESSMENT"
    if battery.sharing_status == "APPROVED_FOR_SECOND_LIFE" or (battery.current_soh and battery.current_soh >= 0.70):
        pathway_badge = "SECOND_LIFE_CANDIDATE"
    elif battery.sharing_status == "APPROVED_FOR_RECYCLING" or (battery.current_soh and battery.current_soh < 0.70) or battery.reported_condition in ["Damaged", "CRITICAL"]:
        pathway_badge = "RECYCLING_CANDIDATE"
    elif battery.sharing_status in ["PROCESSING", "RECOVERY_COMPLETED"]:
        pathway_badge = "IN_RECOVERY"

    return {
        "battery_id": battery.battery_id,
        "battery_uid": battery.battery_uid,
        "category": category,
        "chemistry": battery.chemistry or "Not provided",
        "rated_capacity_kwh": battery.rated_capacity_kwh or 0.0,
        "usable_capacity_kwh": usable_kwh,
        "current_soh": battery.current_soh,
        "soh_pct": soh_pct,
        "charging_cycles": battery.charging_cycles or 0,
        "vehicle_model": battery.vehicle_model or (battery.vehicle.model_name if battery.vehicle else "Not provided"),
        "vehicle_manufacturer": battery.vehicle_manufacturer or "Not provided",
        "purchase_year": battery.purchase_year or (battery.installed_on.year if battery.installed_on else None),
        "reported_condition": battery.reported_condition or "Not assessed",
        "approximate_area": approx_area,
        "city": battery.city or "Regional Center",
        "state": battery.state or "State Register",
        "sharing_status": battery.sharing_status,
        "lifecycle_status": battery.lifecycle_status,
        "second_life_status": battery.second_life_status,
        "second_life_suitability": battery.second_life_suitability or "Not assessed",
        "recycling_status": battery.recycling_status,
        "collection_status": battery.collection_status,
        "estimated_remaining_years": battery.estimated_remaining_years,
        "future_risk": battery.future_risk or "Not evaluated",
        "recommended_next_step": next_step,
        "pathway_badge": pathway_badge,
        "eol_reason": battery.eol_reason,
        "eol_reported_at": battery.eol_reported_at.isoformat() if battery.eol_reported_at else None,
        "is_professionally_assessed": battery.is_professionally_assessed,
        "enquiries_count": len(battery.enquiries) if battery.enquiries else 0,
        "safety_disclaimer": (
            "This health information reflects reported data and/or AI-estimated degradation models. "
            "It is NOT a certified guarantee of safety, remaining capacity, or suitability. "
            "Any second-life application requires bench testing by a qualified technician."
        ),
        "voltage_v": round(battery.voltage_v, 1) if battery.voltage_v else 350.0,
        "current_a": round(battery.current_a, 1) if battery.current_a else 25.0,
        "manufactured_on": battery.manufactured_on.isoformat() if battery.manufactured_on else None,
        "installed_on": battery.installed_on.isoformat() if battery.installed_on else None,
        "odometer_km": round(battery.odometer_km, 1) if battery.odometer_km else None,
        "warranty_years": battery.warranty_years or 8,
        "dc_resistance_mohm": round(battery.dc_resistance_mohm, 2) if battery.dc_resistance_mohm else None,
        "cell_voltage_spread_mv": round(battery.cell_voltage_spread_mv, 1) if battery.cell_voltage_spread_mv else None,
        "is_demo": battery.data_source in ["SIMULATED", "CUSTOMER_DEMO", "DEMO_SHARED"],
        "created_at": battery.created_at.isoformat() if battery.created_at else None,
        "updated_at": battery.updated_at.isoformat() if battery.updated_at else None,
    }


# ---------------------------------------------------------------------------
# 1. GET /api/recycling/batteries (List Shared Records)
# ---------------------------------------------------------------------------

@router.get("/batteries")
def list_shared_batteries(
    status_filter: str | None = Query(default=None, alias="status"),
    chemistry: str | None = Query(default=None),
    state: str | None = Query(default=None),
    min_capacity: float | None = Query(default=None),
    max_capacity: float | None = Query(default=None),
    search: str | None = Query(default=None),
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List all batteries eligible and consented for sharing.
    Filters:
      - status: PENDING_ASSESSMENT, APPROVED_FOR_SECOND_LIFE, APPROVED_FOR_RECYCLING,
                COLLECTION_TRACKING (COLLECTION_REQUESTED, COLLECTED, PROCESSING, RECOVERY_COMPLETED)
      - chemistry: LFP, NMC, etc.
      - state: Regional state filter
      - min_capacity, max_capacity: Rated kWh capacity range
      - search: string match against battery_id, chemistry, or approximate location
    """
    is_ops_role = current_user and current_user.role in ["RECYCLER", "ADMIN"]

    query = db.query(Battery)

    # Privacy constraint: regular viewers ONLY see consented & non-private records.
    # Operational staff (Recycler / Admin) can also see assigned collection tasks.
    if not is_ops_role:
        query = query.filter(
            Battery.sharing_consent.is_(True),
            Battery.sharing_status != "PRIVATE",
        )
    else:
        # Ops role: non-private or consented
        query = query.filter(
            (Battery.sharing_consent.is_(True) & (Battery.sharing_status != "PRIVATE"))
            | (Battery.collection_status.in_(["COLLECTION_REQUESTED", "SCHEDULED", "COLLECTED"]))
        )

    # Status filter
    if status_filter:
        s = status_filter.upper()
        if s in ["PENDING_ASSESSMENT", "AWAITING_ASSESSMENT"]:
            query = query.filter(Battery.sharing_status == "PENDING_ASSESSMENT")
        elif s in ["APPROVED_FOR_SECOND_LIFE", "SECOND_LIFE"]:
            query = query.filter(Battery.sharing_status == "APPROVED_FOR_SECOND_LIFE")
        elif s in ["APPROVED_FOR_RECYCLING", "RECYCLING"]:
            query = query.filter(Battery.sharing_status == "APPROVED_FOR_RECYCLING")
        elif s in ["COLLECTION_TRACKING", "COLLECTION", "TRACKING"]:
            query = query.filter(
                Battery.sharing_status.in_([
                    "COLLECTION_REQUESTED", "COLLECTED", "PROCESSING", "RECOVERY_COMPLETED"
                ])
                | Battery.collection_status.in_(["COLLECTION_REQUESTED", "SCHEDULED", "COLLECTED"])
            )
        else:
            query = query.filter(Battery.sharing_status == s)

    if chemistry and chemistry != "ALL":
        query = query.filter(Battery.chemistry == chemistry.upper())

    if state and state.strip() and state != "ALL":
        query = query.filter(Battery.state.ilike(f"%{state.strip()}%"))

    if min_capacity is not None:
        query = query.filter(Battery.rated_capacity_kwh >= min_capacity)

    if max_capacity is not None:
        query = query.filter(Battery.rated_capacity_kwh <= max_capacity)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(
            Battery.battery_id.ilike(term)
            | Battery.battery_uid.ilike(term)
            | Battery.vehicle_model.ilike(term)
            | Battery.city.ilike(term)
            | Battery.state.ilike(term)
        )

    rows = query.order_by(Battery.updated_at.desc(), Battery.created_at.desc()).limit(100).all()

    # Calculate status counts across all shared records
    base_shared_query = db.query(Battery).filter(
        Battery.sharing_consent.is_(True),
        Battery.sharing_status != "PRIVATE",
    )
    counts = {
        "all": base_shared_query.count(),
        "awaiting_assessment": base_shared_query.filter(Battery.sharing_status == "PENDING_ASSESSMENT").count(),
        "second_life": base_shared_query.filter(Battery.sharing_status == "APPROVED_FOR_SECOND_LIFE").count(),
        "recycling": base_shared_query.filter(Battery.sharing_status == "APPROVED_FOR_RECYCLING").count(),
        "tracking": base_shared_query.filter(
            Battery.sharing_status.in_(["COLLECTION_REQUESTED", "COLLECTED", "PROCESSING", "RECOVERY_COMPLETED"])
        ).count(),
    }

    sanitized = [_sanitize_shared_battery(b, is_authorized_handler=is_ops_role) for b in rows]

    return {
        "count": len(sanitized),
        "counts": counts,
        "batteries": sanitized,
    }


# ---------------------------------------------------------------------------
# Helper: Build Identified Battery Components & Second-Life Pathways
# ---------------------------------------------------------------------------

def _build_identified_components(bat: Battery, disp_rep: BatteryDisposalReport | None) -> list[dict[str, Any]]:
    chem = bat.chemistry or "LFP"
    voltage = bat.voltage_v or 350.0
    cap = bat.rated_capacity_kwh or 40.0
    is_damaged = (bat.reported_condition in ["Damaged", "CRITICAL"]) or (disp_rep and disp_rep.current_condition in ["DAMAGED", "HAZARDOUS"])
    is_reduced = (bat.reported_condition in ["REDUCED_RANGE", "Degraded"]) or (disp_rep and disp_rep.current_condition == "REDUCED_RANGE")

    cell_condition = "Physically damaged / compromised" if is_damaged else ("Operating with observed capacity decline" if is_reduced else "Visually intact; awaiting laboratory bench evaluation")
    cell_faults = (disp_rep.assessment_notes if disp_rep and disp_rep.assessment_notes else bat.eol_reason) if is_damaged else "No physical damage documented in owner declaration"

    return [
        {
            "id": "cells",
            "name": "Battery Cells & Sub-modules",
            "component_type": "Electrochemical Storage",
            "pack_function": "The foundational electrochemical storage unit converting chemical energy into electrical flow during discharge.",
            "specifications": {
                "chemistry": f"{chem} ({'Lithium Iron Phosphate' if chem == 'LFP' else 'Nickel Manganese Cobalt'})",
                "nominal_pack_voltage": f"{voltage:.1f} V DC",
                "rated_nominal_capacity": f"{cap:.1f} kWh",
                "cell_format": "Prismatic / Blade Modular Strings" if chem == "LFP" else "Pouch / Prismatic Groupings",
                "thermal_runaway_threshold": "> 270°C (High thermal stability)" if chem == "LFP" else "~150°C–210°C (Active thermal regulation needed)",
            },
            "recorded_condition": cell_condition,
            "known_faults": cell_faults,
            "potential_applications": [
                "Stationary Energy Storage Systems (BESS)",
                "Solar Energy Storage Systems (5–15 kWh)",
                "Telecom Tower & UPS Backup Power",
                "Hydrometallurgical Critical Mineral Extraction",
            ],
            "testing_required": [
                "Electrochemical Impedance Spectroscopy (EIS)",
                "Module-level capacity retention grading (C/3 discharge test)",
                "Open-circuit voltage (OCV) retention test over 72 hours",
                "Cell-to-cell delta-V balance verification under load",
            ],
            "suggested_pathway": "Recycling or material recovery recommended" if is_damaged else "Potentially reusable pending assessment",
            "pathway_reason": (
                "Documented physical damage or thermal compromise prevents high-voltage energization; direct hydrometallurgical recycling is safest."
                if is_damaged else
                "Cells retain physical integrity but require bench grading and cell balance verification before stationary second-life integration."
            ),
        },
        {
            "id": "modules",
            "name": "Battery Module Assemblies & Interconnects",
            "component_type": "Mechanical & Structural Sub-pack",
            "pack_function": "Groups individual cells into mechanically rigid, serviceable modules with integrated voltage sensing taps and compression plates.",
            "specifications": {
                "module_architecture": "Laser-welded terminal busbars with spring-compression tie rods",
                "typical_subpack_voltage": "24V to 48V DC per modular block",
                "casing_material": "Dielectric structural polycarbonate & aluminum endplates",
            },
            "recorded_condition": "Awaiting modular disassembly inspection" if not is_damaged else "Module deformation reported",
            "known_faults": "Damage reported to pack" if is_damaged else "No module-level mechanical defects documented",
            "potential_applications": [
                "Reconfigured 48V Telecom & Microgrid Banks",
                "EV Replacement Module Spare Parts",
                "Modular Solar Backup Units",
            ],
            "testing_required": [
                "Module internal resistance balance check",
                "Ultrasonic weld inspection on inter-cell tab bonds",
                "Torque verification on high-current terminal studs",
            ],
            "suggested_pathway": "Recycling or material recovery recommended" if is_damaged else "Potentially reusable pending assessment",
            "pathway_reason": "Intact sub-modules can be decoupled and wired in parallel or series for 48V stationary applications without opening individual cells.",
        },
        {
            "id": "bms",
            "name": "Battery Management System (BMS Controller)",
            "component_type": "Electronic Controller & Telemetry",
            "pack_function": "The digital brain of the pack monitoring cell voltages, pack current, temperatures, executing active balancing, and opening safety contactors upon fault.",
            "specifications": {
                "controller_type": "Automotive ASIL-D Master Controller with Slave Cell-Monitoring Boards",
                "operating_voltage": "12V DC logic power / High-voltage isolated sensing",
                "communication_protocol": "Automotive CANbus 2.0B / CAN-FD",
            },
            "recorded_condition": "OEM factory hardware installed; operational telemetry logged",
            "known_faults": "Firmware lockout / immobilizer pairing active (requires CAN protocol gateway or flashing for stationary use)",
            "potential_applications": [
                "Compatible EV Replacement Spare (Same Vehicle Model)",
                "Stationary Storage with CAN Gateway Integration",
                "WEEE Electronic Scrap Precious Metal Recovery",
            ],
            "testing_required": [
                "CANbus communication handshake and diagnostic trouble code (DTC) scan",
                "Analog front-end (AFE) voltage sensing ADC calibration verification",
                "Safety contactor drive circuit and pre-charge relay continuity",
            ],
            "suggested_pathway": "Repair or refurbishment may be required",
            "pathway_reason": "Automotive BMS units require firmware reconfiguration or an external translation gateway to communicate with standard solar inverters.",
        },
        {
            "id": "cooling",
            "name": "Liquid Cooling & Thermal Plates",
            "component_type": "Thermal Management Sub-system",
            "pack_function": "Regulates cell operating temperature to prevent localized thermal hot spots and maintain uniform thermal gradient.",
            "specifications": {
                "plate_construction": "Roll-bonded aluminum cooling channels with extruded fluid manifolds",
                "pressure_rating": "Rated to 2.5 bar operational pressure",
                "compatible_coolant": "50/50 Deionized Water & Inhibited Ethylene Glycol",
            },
            "recorded_condition": "Coolant evacuated; aluminum plates structurally intact",
            "known_faults": "None documented",
            "potential_applications": [
                "Stationary BESS Thermal Management Loops",
                "Industrial Liquid Heat Exchangers",
                "Closed-Loop Wrought Aluminum Remelting",
            ],
            "testing_required": [
                "Pneumatic pressure decay leak test at 2.0 bar",
                "Channel flow rate and blockage verification flush",
                "Corrosion and galvanic pitting inspection",
            ],
            "suggested_pathway": "Suitable for a specified application following assessment",
            "pathway_reason": "Clean cooling plates without internal blockages can be integrated directly into stationary storage cooling loops or cleanly recycled.",
        },
        {
            "id": "busbars",
            "name": "High-Voltage Busbars & Electrical Connections",
            "component_type": "High-Current Electrical Distribution",
            "pack_function": "Carries high currents (up to 400A continuous, 800A peak) between cell modules, safety contactors, and external vehicle terminals.",
            "specifications": {
                "conductor_material": "C11000 Electrolytic Tough Pitch Pure Copper (99.9% Cu)",
                "plating": "Tin or Nickel electroplated anti-oxidation coating",
                "current_rating": "Rated for 400A continuous / 800A surge",
            },
            "recorded_condition": "Mechanically intact; terminal contact surfaces sound",
            "known_faults": "None documented",
            "potential_applications": [
                "Reconfigured Buswork for Stationary Battery Banks",
                "Industrial Switchgear & DC Power Distribution",
                "Direct Smelting for 99.9% Pure Cathode Copper",
            ],
            "testing_required": [
                "Micro-ohmmeter contact resistance measurement (< 50 µΩ)",
                "Dielectric breakdown test on flame-retardant polyamide insulation (> 1500V DC)",
                "Visual check for terminal galling or oxidation",
            ],
            "suggested_pathway": "Suitable for a specified application following assessment",
            "pathway_reason": "High-purity copper busbars are mechanically robust and easily re-used in stationary bus layouts or remelted with near-zero material loss.",
        },
        {
            "id": "enclosure",
            "name": "Structural Battery Enclosure & Housing",
            "component_type": "Structural Protection & IP67 Enclosure",
            "pack_function": "Shields cells from debris and collision loads, maintains IP67 hermetic seal against water and dust ingress, and incorporates pressure relief vents.",
            "specifications": {
                "tray_material": "Extruded 6000-series structural aluminum alloy tray with stamped steel service lid",
                "environmental_rating": "IP67 / IP69K ingress protection with EPDM perimeter gasket",
                "safety_venting": "Integrated dual fluoropolymer pressure relief valves",
            },
            "recorded_condition": "Underbody casing deformation reported" if is_damaged else "Housing structurally intact; seals in place",
            "known_faults": "Impact/deformation documented" if is_damaged else "No external puncture or seal failure documented",
            "potential_applications": [
                "Weatherproof Outdoor Enclosure for Stationary Solar Battery Banks",
                "Industrial Protective Storage Housing",
                "Secondary Aluminum & Steel Remelting (95% energy savings)",
            ],
            "testing_required": [
                "Vacuum decay hermetic seal test",
                "Weld seam dye penetrant inspection",
                "Pressure relief vent burst membrane check",
            ],
            "suggested_pathway": "Recycling or material recovery recommended" if is_damaged else "Suitable for a specified application following assessment",
            "pathway_reason": (
                "Deformed or punctured structural housing cannot guarantee IP67 containment; remelting recovers high-grade aluminum."
                if is_damaged else
                "Intact automotive casings offer superior environmental protection for outdoor ground-mounted energy storage systems."
            ),
        },
        {
            "id": "contactors",
            "name": "High-Voltage Contactors & Safety Pyrofuse",
            "component_type": "Safety Isolation & Circuit Protection",
            "pack_function": "Electromechanically isolates high-voltage terminals when the system is off and severs circuit in under 1 millisecond on short-circuit.",
            "specifications": {
                "relay_type": "Dual hermetically sealed ceramic arc-chamber contactors (450V / 500A)",
                "safety_disconnect": "High-speed pyrotechnic circuit breaker (pyrofuse) + manual service disconnect",
                "auxiliary_coil": "12V DC coil with magnetic blowout suppression",
            },
            "recorded_condition": "Relays present; pyrofuse un-triggered",
            "known_faults": "None documented",
            "potential_applications": [
                "DC Safety Disconnect in Stationary Energy Storage Systems",
                "Replacement Parts for Vehicle Maintenance",
                "Precious Metals Recycling (Silver contact recovery)",
            ],
            "testing_required": [
                "Coil pick-up and drop-out voltage verification",
                "Contact resistance under load (< 1 mΩ)",
                "Pyrofuse bridge wire continuity test (low voltage only)",
            ],
            "suggested_pathway": "Suitable for a specified application following assessment",
            "pathway_reason": "Certified hermetic automotive contactors provide critical automatic disconnect protection for secondary stationary installations.",
        },
        {
            "id": "sense_harness",
            "name": "Voltage & Temperature Sense Wiring Harness",
            "component_type": "Sensor Signal Distribution",
            "pack_function": "Channels individual cell tap voltages and thermistor temperature signals back to the BMS analog front-end chips.",
            "specifications": {
                "wiring_type": "Multi-conductor automotive harness with tinned copper conductors and locking connectors",
                "sensors": "Integrated NTC 10kΩ thermistors distributed across cell modules",
                "insulation": "High-temperature cross-linked polyethylene (XLPE)",
            },
            "recorded_condition": "Harness intact; pins and locking tabs undamaged",
            "known_faults": "None documented",
            "potential_applications": [
                "Reused with Compatible Stationary BMS Controllers",
                "Granulated Copper Wire Scrap Recycling (99% Cu)",
            ],
            "testing_required": [
                "Pin-to-pin wiring continuity check",
                "Insulation resistance test between adjacent channels (> 100 MΩ)",
                "Thermistor calibration verification at ambient temperature",
            ],
            "suggested_pathway": "Potentially reusable pending assessment",
            "pathway_reason": "Reusable if locking pins and insulation are intact; otherwise easily recycled for high-grade copper recovery.",
        },
        {
            "id": "insulation",
            "name": "Dielectric Barriers & Fire Insulation",
            "component_type": "Electrical Safety & Thermal Barrier",
            "pack_function": "Provides galvanic high-voltage electrical insulation and creates a fireproof thermal barrier between cells to stop propagation.",
            "specifications": {
                "barrier_materials": "Silica aerogel blankets, compressed mica laminates, and aramid sheets",
                "dielectric_rating": "> 2500V DC dielectric breakdown strength",
                "flammability_class": "UL94 V-0 flame-retardant rating",
            },
            "recorded_condition": "Installed in module stacks; requires visual inspection upon pack disassembly",
            "known_faults": "None documented",
            "potential_applications": [
                "Inter-Module Partitions in Stationary Storage Cabinets",
                "High-Temperature Industrial Thermal Barriers",
                "Specialized Mineral Scrap Recovery",
            ],
            "testing_required": [
                "Dielectric withstand voltage test (> 2500V DC)",
                "Visual inspection for tearing, moisture absorption, or compression set",
            ],
            "suggested_pathway": "Repair or refurbishment may be required",
            "pathway_reason": "Thermal blankets may experience mechanical set during removal and should be inspected or augmented before stationary repurposing.",
        },
    ]


@router.get("/batteries/{battery_id}")
def get_shared_battery(
    battery_id: str,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve detailed specifications for a single shared battery."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Battery record '{battery_id}' not found.",
        )

    is_owner = current_user and bat.user_id == current_user.id
    is_ops = current_user and current_user.role in ["RECYCLER", "ADMIN"]

    # If battery is private, only owner or ops staff may view it
    if bat.sharing_status == "PRIVATE" and not (is_owner or is_ops):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This battery record is private and has not been approved for public sharing.",
        )

    # Fetch lifecycle events
    events = (
        db.query(LifecycleEvent)
        .filter(LifecycleEvent.battery_id == bat.id)
        .order_by(LifecycleEvent.occurred_at.asc())
        .all()
    )

    timeline = []
    for ev in events:
        actor_label = "Vehicle Owner" if ev.actor in ["customer", "owner"] else (ev.actor or "System")
        if not is_ops and not is_owner:
            actor_label = "Authorized Circular Partner" if ev.actor != "customer" else "Vehicle Owner"

        timeline.append({
            "id": ev.id,
            "occurred_at": ev.occurred_at.isoformat(),
            "year": ev.occurred_at.year,
            "event": ev.event,
            "location": ev.location or "Certified Facility",
            "handler": ev.handler or "EVolve AI Network",
            "status": ev.status,
            "actor": actor_label,
            "evidence_ref": ev.evidence_ref if (is_owner or is_ops) else "VERIFIED",
        })

    # Fetch latest disposal assessment if reported
    disp_rep = (
        db.query(BatteryDisposalReport)
        .filter(BatteryDisposalReport.battery_id == bat.id)
        .order_by(BatteryDisposalReport.created_at.desc())
        .first()
    )
    disposal_info = {
        "reporting_reason": disp_rep.reporting_reason,
        "current_condition": disp_rep.current_condition,
        "professionally_assessed": disp_rep.professionally_assessed,
        "assessment_notes": disp_rep.assessment_notes,
        "reported_at": disp_rep.created_at.isoformat(),
        "collection_city": disp_rep.collection_city,
        "collection_state": disp_rep.collection_state,
    } if disp_rep else {
        "reporting_reason": bat.eol_reason or "End of useful vehicle service",
        "current_condition": bat.reported_condition or "Working",
        "professionally_assessed": bat.is_professionally_assessed,
        "assessment_notes": None,
        "reported_at": bat.eol_reported_at.isoformat() if bat.eol_reported_at else None,
        "collection_city": bat.city or "Regional",
        "collection_state": bat.state or "India",
    }

    return {
        "battery": _sanitize_shared_battery(bat, is_authorized_handler=is_ops),
        "disposal_info": disposal_info,
        "timeline": timeline,
        "components": _build_identified_components(bat, disp_rep),
        "is_owner": is_owner,
        "is_ops_authorized": is_ops,
    }


# ---------------------------------------------------------------------------
# 3. GET /api/recycling/batteries/{battery_id}/lifecycle (Lifecycle Events)
# ---------------------------------------------------------------------------

@router.get("/batteries/{battery_id}/lifecycle")
def get_shared_battery_lifecycle(
    battery_id: str,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve chronological audit trail of recorded lifecycle events."""
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    is_owner = current_user and bat.user_id == current_user.id
    is_ops = current_user and current_user.role in ["RECYCLER", "ADMIN"]

    if bat.sharing_status == "PRIVATE" and not (is_owner or is_ops):
        raise HTTPException(status_code=403, detail="Battery record is private.")

    events = (
        db.query(LifecycleEvent)
        .filter(LifecycleEvent.battery_id == bat.id)
        .order_by(LifecycleEvent.occurred_at.asc())
        .all()
    )

    trail = []
    for ev in events:
        actor_label = "Vehicle Owner" if ev.actor in ["customer", "owner"] else "Authorized Handler"
        trail.append({
            "occurred_at": ev.occurred_at.isoformat(),
            "year": ev.occurred_at.year,
            "event": ev.event,
            "location": ev.location,
            "handler": ev.handler,
            "status": ev.status,
            "actor": actor_label,
        })

    return {
        "battery_id": bat.battery_id,
        "battery_uid": bat.battery_uid,
        "event_count": len(trail),
        "timeline": trail,
    }


# ---------------------------------------------------------------------------
# 4. POST /api/recycling/batteries/{battery_id}/assessment (Authorized Action)
# ---------------------------------------------------------------------------

@router.post("/batteries/{battery_id}/assessment")
def submit_battery_assessment(
    battery_id: str,
    payload: RecyclingAssessmentRequest,
    current_user: User = Depends(require_role(["RECYCLER", "ADMIN"])),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Authorized action (Recycler / Admin): record physical/laboratory test assessment.
    Transitions status to APPROVED_FOR_SECOND_LIFE, APPROVED_FOR_RECYCLING, or CONTINUE_USE.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    outcome = payload.outcome.upper()
    if outcome not in ["APPROVED_FOR_SECOND_LIFE", "APPROVED_FOR_RECYCLING", "CONTINUE_USE"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid outcome. Must be APPROVED_FOR_SECOND_LIFE, APPROVED_FOR_RECYCLING, or CONTINUE_USE.",
        )

    # Apply tested SOH if provided
    if payload.tested_soh is not None:
        bat.current_soh = payload.tested_soh

    if outcome == "APPROVED_FOR_SECOND_LIFE":
        bat.sharing_status = "APPROVED_FOR_SECOND_LIFE"
        bat.second_life_status = "ASSESSED_SUITABLE"
        bat.second_life_suitability = "HIGH"
        bat.lifecycle_status = "SECOND_LIFE_CANDIDATE"
    elif outcome == "APPROVED_FOR_RECYCLING":
        bat.sharing_status = "APPROVED_FOR_RECYCLING"
        bat.recycling_status = "APPROVED"
        bat.lifecycle_status = "EOL_CANDIDATE"
    elif outcome == "CONTINUE_USE":
        bat.sharing_status = "PRIVATE"
    bat.is_professionally_assessed = True
    bat.data_source = "PROFESSIONALLY_ASSESSED"
    bat.updated_at = _utcnow()

    # Append to immutable audit trail
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="ASSESSMENT_COMPLETED",
            location=f"{bat.city or 'Testing Center'}, {bat.state or 'India'}",
            handler=current_user.full_name or "Certified Diagnostic Center",
            status=outcome,
            evidence_ref=f"ASSESS-{bat.battery_id}",
            actor=current_user.username,
        )
    )

    db.commit()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "sharing_status": bat.sharing_status,
        "outcome": outcome,
        "message": f"Assessment recorded successfully as '{outcome}'.",
    }


# ---------------------------------------------------------------------------
# 5. POST /api/recycling/batteries/{battery_id}/collection (Authorized Action)
# ---------------------------------------------------------------------------

@router.post("/batteries/{battery_id}/collection")
def update_battery_collection(
    battery_id: str,
    payload: RecyclingCollectionRequest,
    current_user: User = Depends(require_role(["RECYCLER", "ADMIN"])),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Authorized action (Recycler / Admin): update battery collection tracking.
    Actions: CONFIRM_PICKUP, MARK_COLLECTED, DELIVERED_TO_FACILITY.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    action = payload.action.upper()
    if action == "CONFIRM_PICKUP":
        bat.collection_status = "SCHEDULED"
        ev_type = "COLLECTION_CONFIRMED"
    elif action == "MARK_COLLECTED":
        bat.collection_status = "COLLECTED"
        bat.sharing_status = "COLLECTED"
        ev_type = "COLLECTION_COMPLETED"
    elif action == "DELIVERED_TO_FACILITY":
        bat.collection_status = "DELIVERED_TO_FACILITY"
        bat.sharing_status = "PROCESSING"
        ev_type = "RECEIVED_AT_FACILITY"
    else:
        raise HTTPException(
            status_code=400,
            detail="Action must be CONFIRM_PICKUP, MARK_COLLECTED, or DELIVERED_TO_FACILITY.",
        )

    bat.updated_at = _utcnow()

    # Append to lifecycle audit log
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event=ev_type,
            location=f"{bat.city or 'Regional Hub'}, {bat.state or 'India'}",
            handler=current_user.full_name or "Authorized Reverse Logistics",
            status=bat.collection_status,
            evidence_ref=f"LOG-{bat.battery_id}",
            actor=current_user.username,
        )
    )

    db.commit()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "collection_status": bat.collection_status,
        "sharing_status": bat.sharing_status,
        "message": f"Collection event '{ev_type}' recorded successfully.",
    }


# ---------------------------------------------------------------------------
# 6. PATCH /api/recycling/batteries/{battery_id}/status (Authorized Action)
# ---------------------------------------------------------------------------

@router.patch("/batteries/{battery_id}/status")
def update_battery_recycling_status(
    battery_id: str,
    payload: RecyclingStatusUpdateRequest,
    current_user: User = Depends(require_role(["RECYCLER", "ADMIN"])),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Authorized action (Recycler / Admin): update processing or mineral recovery completion.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()

    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    target_status = payload.status.upper()
    if target_status == "PROCESSING":
        bat.sharing_status = "PROCESSING"
        bat.recycling_status = "IN_PROGRESS"
        ev_type = "RECYCLING_PROCESSING_STARTED"
    elif target_status == "RECOVERY_COMPLETED":
        bat.sharing_status = "RECOVERY_COMPLETED"
        bat.recycling_status = "RECYCLED"
        bat.lifecycle_status = "RECOVERED"
        ev_type = "RECOVERY_PROCESS_COMPLETED"
    else:
        raise HTTPException(
            status_code=400,
            detail="Status must be PROCESSING or RECOVERY_COMPLETED.",
        )

    bat.updated_at = _utcnow()

    rec_pct_str = f" · {payload.material_recovered_pct}% Recovery" if payload.material_recovered_pct else ""
    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event=ev_type,
            location=f"{bat.city or 'Processing Plant'}, {bat.state or 'India'}",
            handler=current_user.full_name or "Certified Hydrometallurgical Refinery",
            status=f"{target_status}{rec_pct_str}",
            evidence_ref=f"REC-{bat.battery_id}",
            actor=current_user.username,
        )
    )

    db.commit()

    return {
        "status": "success",
        "battery_id": bat.battery_id,
        "sharing_status": bat.sharing_status,
        "recycling_status": bat.recycling_status,
        "message": f"Status updated to '{target_status}'.",
    }


# ---------------------------------------------------------------------------
# 7. POST /api/recycling/batteries/{battery_id}/enquire (Consumer Enquiry)
# ---------------------------------------------------------------------------

@router.post("/batteries/{battery_id}/enquire")
def submit_battery_enquiry(
    battery_id: str,
    payload: BatteryEnquiryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Consumer submits a non-binding inquiry about an eligible shared battery.
    Personal owner details are strictly protected.
    """
    bat = db.query(Battery).filter(
        (Battery.battery_id == battery_id) | (Battery.battery_uid == battery_id)
    ).first()
    if not bat:
        raise HTTPException(status_code=404, detail="Battery record not found.")

    if bat.sharing_status == "PRIVATE" or not bat.sharing_consent:
        raise HTTPException(
            status_code=400,
            detail="This battery is currently private and not available for circular inquiries.",
        )

    enq_id = f"ENQ-{uuid.uuid4().hex[:8].upper()}"
    email_parts = current_user.email.split("@")
    masked_email = f"{email_parts[0][:2]}***@{email_parts[1]}" if len(email_parts) == 2 else "masked@user"

    enquiry = BatteryEnquiry(
        enquiry_id=enq_id,
        battery_id=bat.id,
        consumer_id=current_user.id,
        enquiry_purpose=payload.enquiry_purpose,
        intended_application=payload.intended_application,
        message=payload.message,
        consumer_name=current_user.full_name or current_user.username,
        consumer_masked_email=masked_email,
        status="SUBMITTED",
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(enquiry)

    db.add(
        LifecycleEvent(
            battery_id=bat.id,
            occurred_at=_utcnow(),
            event="CONSUMER_ENQUIRY_LOGGED",
            location="EVolve AI Discovery Portal",
            handler="Consumer Engagement Service",
            status=bat.sharing_status,
            evidence_ref=enq_id,
            actor="consumer",
        )
    )

    db.commit()

    return {
        "status": "success",
        "enquiry_id": enq_id,
        "battery_id": bat.battery_id,
        "message": "Your inquiry has been successfully submitted. EVolve AI coordinates between owners, authorized recyclers, and interested parties.",
        "notice": "The vehicle owner's personal contact details are kept private to ensure safety and data security.",
    }


# ---------------------------------------------------------------------------
# 8. GET /api/recycling/my-enquiries (Consumer Inquiries List)
# ---------------------------------------------------------------------------

@router.get("/my-enquiries")
def list_my_consumer_enquiries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    List inquiries submitted by the authenticated consumer.
    """
    enquiries = (
        db.query(BatteryEnquiry)
        .filter(BatteryEnquiry.consumer_id == current_user.id)
        .order_by(BatteryEnquiry.created_at.desc())
        .all()
    )

    items = []
    for enq in enquiries:
        bat = enq.battery
        soh_pct = round(bat.current_soh * 100.0, 1) if (bat and bat.current_soh is not None) else None
        items.append({
            "enquiry_id": enq.enquiry_id,
            "battery_id": bat.battery_id if bat else "UNKNOWN",
            "battery_summary": {
                "vehicle_model": bat.vehicle_model if bat else "EV",
                "vehicle_manufacturer": bat.vehicle_manufacturer if bat else "Manufacturer",
                "chemistry": bat.chemistry if bat else "LFP",
                "rated_capacity_kwh": bat.rated_capacity_kwh if bat else 0.0,
                "approximate_area": f"{bat.city or 'Regional'}, {bat.state or 'India'}" if bat else "India",
                "sharing_status": bat.sharing_status if bat else "PRIVATE",
                "soh_pct": soh_pct,
            } if bat else None,
            "enquiry_purpose": enq.enquiry_purpose,
            "intended_application": enq.intended_application,
            "message": enq.message,
            "status": enq.status,
            "response_notes": enq.response_notes,
            "created_at": enq.created_at.isoformat(),
        })

    return {
        "count": len(items),
        "enquiries": items,
    }


# ---------------------------------------------------------------------------
# 9. GET /api/recycling/parts-guide (9-Component Educational Guide)
# ---------------------------------------------------------------------------

PARTS_GUIDE_DATA = [
    {
        "id": "cells",
        "name": "Battery Cells & Modules",
        "category": "Electrochemical",
        "icon": "Layers",
        "primary_materials": ["Cathode Active Material", "Graphite Anode", "Fluorinated Electrolyte", "Polyolefin Separator", "Copper & Aluminum Current Foils"],
        "critical_minerals": ["Lithium (Li)", "Cobalt (Co)", "Nickel (Ni)", "Manganese (Mn)", "Natural/Synthetic Graphite"],
        "pack_function": "The foundational electrochemical storage unit converting chemical energy into electrical flow during discharge.",
        "second_life_suitability": "High for cells with SOH >= 70% and uniform internal resistance across modules.",
        "second_life_pathway": "Disassembly into sub-modules, capacity grading, pulse testing, and re-binning into stationary battery racks for solar/UPS.",
        "recycling_pathway": "Shredding in an inert argon/nitrogen atmosphere, electrolyte recovery, and hydrometallurgical black mass leaching to extract 95%+ pure battery-grade metal sulfates.",
        "hydrometallurgical_recovery_rate": "95–98% elemental recovery for Li, Ni, Co",
        "handling_and_hazards": "Extreme thermal runaway hazard if pierced or shorted. Flammable volatile organics in electrolyte. Hydrofluoric acid (HF) emission hazard on moisture exposure. Must be handled by trained personnel with Class D fire suppression.",
        "chemistry_specific_notes": {
            "LFP": "LiFePO4 cathode. Extremely high thermal runaway threshold (>270°C). Cycle life of 3,000–6,000 cycles. Zero cobalt or nickel. Prime choice for residential and microgrid second-life storage.",
            "NMC": "Nickel Manganese Cobalt cathode. High energy density (220–300 Wh/kg). Critical recycling economics due to cobalt and nickel market value. Second-life feasible if cell balance is healthy.",
            "NCA": "Nickel Cobalt Aluminum oxide cathode. High power and specific energy. Similar circular dynamics to NMC with mandatory hydrometallurgical recovery.",
            "GENERAL": "Cell health and impedance balance determine whether module repurposing or closed-loop mineral recycling is the optimal path.",
        },
    },
    {
        "id": "bms",
        "name": "Battery Management System (BMS)",
        "category": "Electronic",
        "icon": "Cpu",
        "primary_materials": ["FR-4 Glass-Reinforced Epoxy PCBs", "Automotive Microcontrollers (MCU)", "Precision Current Shunts", "SMD Passive Components"],
        "critical_minerals": ["Copper (Cu)", "Gold (Au)", "Silver (Ag)", "Tin (Sn)", "Silicon (Si)"],
        "pack_function": "The digital brain of the pack monitoring cell voltages, pack current, temperatures, executing active balancing, and opening safety contactors upon fault.",
        "second_life_suitability": "Medium to High. Requires firmware adaptation or CAN protocol translation for stationary inverter integration.",
        "second_life_pathway": "Reprogramming or deployment with an external CAN gateway to communicate with hybrid solar inverters (SMA, Victron, Deye).",
        "recycling_pathway": "Specialized WEEE/PCB electronic scrap recycling with multi-stage crushing, electrostatic separation, and precious metals smelting.",
        "hydrometallurgical_recovery_rate": "90%+ precious and base metal recovery from PCBs",
        "handling_and_hazards": "Static electricity sensitive device (ESD). Ensure capacitors are fully discharged before removal. No high-voltage chemical hazard.",
        "chemistry_specific_notes": {
            "LFP": "Requires high-resolution voltage measurement ADCs due to LFP's flat discharge curve between 20% and 80% SOC.",
            "NMC": "Steep voltage vs. SOC curve makes state-of-charge calculation simpler; tighter thermal monitoring required due to lower thermal runaway threshold.",
            "NCA": "High-frequency cell balancing required to avoid module divergence during heavy cycles.",
            "GENERAL": "The BMS holds diagnostic cycle history and telemetry crucial for verifying true state of health before reuse.",
        },
    },
    {
        "id": "enclosure",
        "name": "Structural Enclosure & Housing",
        "category": "Structural",
        "icon": "Box",
        "primary_materials": ["Extruded 6000-Series Aluminum Alloys", "High-Strength Stamped Steel Tray", "EPDM IP67/IP69K Perimeter Gasket", "Fluoropolymer Venting Membranes"],
        "critical_minerals": ["Aluminum (Al)", "Iron (Fe)", "Silicon (Si)", "Magnesium (Mg)"],
        "pack_function": "Shields cells from debris and collision loads, maintains IP67 hermetic seal against water and dust ingress, and incorporates pressure relief vents.",
        "second_life_suitability": "High. The rigid, weather-resistant enclosure serves as an ideal ready-made outdoor stationary battery enclosure.",
        "second_life_pathway": "Cleaned, re-sealed, and mounted onto ground pads or industrial racks for safe stationary energy storage installations.",
        "recycling_pathway": "Direct secondary aluminum and steel remelting in electric arc furnaces, saving 95% of the energy compared to virgin bauxite smelting.",
        "hydrometallurgical_recovery_rate": "100% mechanical and pyrometallurgical remelting efficiency",
        "handling_and_hazards": "Mechanical heavy lifting hazards (pack casing often weighs 80–150 kg). Use overhead hoists and rated lift fixtures.",
        "chemistry_specific_notes": {
            "LFP": "Heavier structural pack enclosures due to cell-to-pack integration and higher cell mass.",
            "NMC": "Often features intricate multi-compartment crash beams and blast-shielding between modules.",
            "NCA": "High-rigidity lower tub designed to withstand high intrusion forces.",
            "GENERAL": "Closed-loop aluminum recycling provides substantial greenhouse gas abatement compared to primary metallurgy.",
        },
    },
    {
        "id": "cooling",
        "name": "Liquid Cooling & Thermal Plates",
        "category": "Thermal",
        "icon": "Thermometer",
        "primary_materials": ["Roll-Bonded Aluminum Plates", "Extruded Fluid Manifolds", "Inhibited Ethylene Glycol / Deionized Water Coolant", "EPDM Fluid Hoses"],
        "critical_minerals": ["Aluminum (Al)", "Copper (Cu)"],
        "pack_function": "Maintains pack temperatures between 20°C and 35°C to minimize degradation during charging and prevent localized thermal hot spots.",
        "second_life_suitability": "Moderate. Low C-rate stationary storage (< 0.5C) frequently operates with ambient or passive air cooling, making active liquid loops optional.",
        "second_life_pathway": "Flushed and connected to a stationary low-power radiator or geothermal thermal loop for indoor commercial storage rooms.",
        "recycling_pathway": "Complete fluid evacuation and specialized chemical recovery; clean aluminum plates sheared and recycled as premium wrought scrap.",
        "hydrometallurgical_recovery_rate": "98%+ aluminum recovery following coolant evacuation",
        "handling_and_hazards": "Coolant is toxic to ingest and harmful to aquatic ecosystems. Must be drained into sealed drums before dismantling the battery.",
        "chemistry_specific_notes": {
            "LFP": "Broader safe temperature window; stationary second-life often succeeds without active liquid chillers under ambient conditions.",
            "NMC": "Requires strict thermal management even in second-life if operated above 0.5C charging rates to prevent localized cell aging.",
            "NCA": "Sensitive to temperature gradients across parallel cell strings; cooling plates must be inspected for clogging.",
            "GENERAL": "Coolant leaks inside the enclosure can severely degrade insulation resistance and create catastrophic HV faults.",
        },
    },
    {
        "id": "busbars",
        "name": "High-Voltage Busbars & Wiring",
        "category": "Electrical",
        "icon": "Zap",
        "primary_materials": ["C11000 Electrolytic Tough Pitch Copper", "Aluminum 1050 Busbars", "Nickel Plating", "Flame-Retardant Polyamide (PA66) Insulation"],
        "critical_minerals": ["Copper (Cu)", "Aluminum (Al)", "Nickel (Ni)"],
        "pack_function": "Carries high currents (up to 400A continuous, 800A peak) between cell modules, safety contactors, and external vehicle terminals.",
        "second_life_suitability": "High. Busbars can be reused or re-bolted to configure different voltage/current arrangements (e.g. 48V telecom vs 400V microgrid).",
        "second_life_pathway": "Ultrasonic weld inspection, contact surface polishing, and re-assembly into custom series/parallel stationary configurations.",
        "recycling_pathway": "Mechanical insulation stripping followed by direct copper and aluminum smelting producing 99.9% pure cathode copper.",
        "hydrometallurgical_recovery_rate": "99%+ metal purity via pyrometallurgical refining",
        "handling_and_hazards": "High-voltage electrocution hazard! Busbars remain energized until modules are individually disconnected. Use Class 0 (1000V) insulated gloves and tools.",
        "chemistry_specific_notes": {
            "LFP": "Higher cross-sectional area busbars frequently utilized due to higher current draws for equivalent power at lower nominal cell voltages (3.2V vs 3.7V).",
            "NMC": "Compact laser-welded busbars common in high-density module layouts.",
            "NCA": "Ultrasonic wire bonding or laser-stitched copper-aluminum bimetallic busbars.",
            "GENERAL": "High economic salvage value per kilogram due to pure copper content.",
        },
    },
    {
        "id": "contactors",
        "name": "HV Contactors & Safety Pyrofuse",
        "category": "Safety",
        "icon": "ShieldAlert",
        "primary_materials": ["Silver-Nickel (AgNi) Contacts", "Ceramic Arc-Chamber Housing", "Copper Solenoid Coils", "Pyrotechnic Ignition Pellets"],
        "critical_minerals": ["Silver (Ag)", "Copper (Cu)", "Nickel (Ni)"],
        "pack_function": "Electromechanical relays that electrically isolate the battery from vehicle terminals when stationary, plus a 1-millisecond pyrofuse that severs main bus under short-circuit.",
        "second_life_suitability": "High. Provides essential automatic DC disconnect and overcurrent protection for second-life stationary battery banks.",
        "second_life_pathway": "Tested for coil resistance, contact resistance (< 1 mOhm), and integrated into the stationary system DC switchboard.",
        "recycling_pathway": "Controlled pyrofuse decommission in specialized blast containment, followed by separation of silver contacts, copper coils, and ceramics.",
        "hydrometallurgical_recovery_rate": "High silver and copper recovery via precious metals recycling",
        "handling_and_hazards": "Pyrofuses contain small pyrotechnic squibs. Do not apply unauthorized voltage test probes across pyrofuse trigger pins.",
        "chemistry_specific_notes": {
            "LFP": "Standard automotive DC contactors with magnetic blowout coils suitable for 400V/800V architectures.",
            "NMC": "Fast-acting bidirectional contactors essential to break fault currents before thermal runaway onset.",
            "NCA": "Paired with ultra-fast solid-state or pyrotechnic disconnects.",
            "GENERAL": "Never bypass contactors or pyrofuses when building a second-life storage system.",
        },
    },
    {
        "id": "tim",
        "name": "Thermal Interface Materials (TIM)",
        "category": "Thermal",
        "icon": "Minimize",
        "primary_materials": ["Silicone-Based Thermal Putty", "Polyurethane Structural Adhesives", "Alumina (Al2O3) & Boron Nitride Mineral Fillers"],
        "critical_minerals": ["Aluminum (Al)", "Silicon (Si)", "Boron (B)"],
        "pack_function": "Fills micro-air gaps between cell bottoms and cooling plates, maximizing thermal conduction while providing electrical dielectric breakdown resistance.",
        "second_life_suitability": "Low. TIM usually breaks apart during module removal and must be replaced with fresh thermal gap pads during pack refurbishment.",
        "second_life_pathway": "Scraped and replaced with fresh phase-change pads or non-curing thermal paste matched to the stationary storage thermal design.",
        "recycling_pathway": "Thermal delamination in pyrolysis ovens or solvent-assisted debonding during mechanical recycling prep.",
        "hydrometallurgical_recovery_rate": "Non-metallic residues safely treated or incorporated into composite aggregates",
        "handling_and_hazards": "Strong structural bonding adhesives can distort pouch or prismatic cell cases during forceful prying. Requires specialized debonding techniques.",
        "chemistry_specific_notes": {
            "LFP": "Structural polyurethanes common in Cell-to-Pack (CTP) designs (e.g. BYD Blade), requiring automated debonding equipment.",
            "NMC": "Soft silicone gap fillers common in module-based architectures, easier to cleanly decouple.",
            "NCA": "High dielectric strength TIM formulations rated for > 2.5 kV breakdown voltage.",
            "GENERAL": "Proper application of fresh TIM during second-life assembly prevents premature cell hotspots.",
        },
    },
    {
        "id": "sense_harness",
        "name": "Voltage & Temperature Sense Harness",
        "category": "Electronic",
        "icon": "GitBranch",
        "primary_materials": ["Flexible Printed Circuits (FPC)", "Stranded Tinned Copper Wires", "NTC Thermistor Sensors", "Gold-Plated Automotive Terminals"],
        "critical_minerals": ["Copper (Cu)", "Gold (Au)", "Tin (Sn)", "Nickel (Ni)"],
        "pack_function": "Channels individual cell tap voltages (typically every single parallel group) and thermistor temperature signals back to the BMS analog front-end chips.",
        "second_life_suitability": "High. Essential for maintaining individual cell health visibility in second-life storage installations.",
        "second_life_pathway": "Tested for pin-to-pin continuity and insulation integrity, then plugged into stationary cell-monitoring hardware.",
        "recycling_pathway": "Mechanical wire granulators separate plastic insulation from high-grade copper chops with 99% copper purity.",
        "hydrometallurgical_recovery_rate": "99% copper recovery from wire granulation",
        "handling_and_hazards": "Extremely fragile wiring tabs! Tugging or pinching can short adjacent cells or tear cell tabs irreparably. Unplug locking connectors gently.",
        "chemistry_specific_notes": {
            "LFP": "Requires tight thermistor spacing to detect localized cell temperature shifts across long series strings.",
            "NMC": "FPC circuits with integrated surface-mount thermistors positioned directly between cell pairs.",
            "NCA": "Dual redundant sense circuits common on high-output automotive packs.",
            "GENERAL": "Accurate cell sensing is the number one defense against overcharging in second-life deployment.",
        },
    },
    {
        "id": "insulation",
        "name": "Dielectric Barriers & Fire Blankets",
        "category": "Safety",
        "icon": "Flame",
        "primary_materials": ["Silica Aerogel Blankets", "Mica Sheet Laminates", "Intumescent Silicone Barrier Foam", "Nomex / Aramid Polymer Sheets"],
        "critical_minerals": ["Silicon (Si)", "Potassium (K)", "Mica Silicates"],
        "pack_function": "Provides galvanic high-voltage electrical insulation (> 2500V DC breakdown) and creates a fireproof thermal barrier between cells to stop propagation.",
        "second_life_suitability": "High. Keeps second-life stationary battery cabinets safe from moisture-induced tracking faults and internal arcing.",
        "second_life_pathway": "Inspected for mechanical tears, moisture absorption, or compression set; re-installed between modules in stationary enclosures.",
        "recycling_pathway": "High-temperature non-reactive mineral separation; can be recycled into construction insulation or refractory ceramic products.",
        "hydrometallurgical_recovery_rate": "Inert mineral fraction recovered during shredding and separation",
        "handling_and_hazards": "Cutting or tearing aerogel/mica sheets generates fine silicate dust. Wear N95/P100 particulate respirators and safety goggles during handling.",
        "chemistry_specific_notes": {
            "LFP": "Thin mica barriers typically sufficient due to LFP's resistance to explosive thermal events.",
            "NMC": "Heavy-duty aerogel insulation blankets and inter-cell compression pads designed to absorb cell swelling over cycle life.",
            "NCA": "Multi-layered composite thermal blankets rated for temperatures exceeding 1000°C.",
            "GENERAL": "Never assemble a second-life battery without compliant dielectric barriers between cell clusters and metal chassis.",
        },
    },
]


@router.get("/parts-guide")
def get_battery_parts_guide(
    chemistry: str | None = Query(default=None),
) -> dict[str, Any]:
    """
    Returns the comprehensive 9-component educational guide for EV battery packs.
    Supports filtering or highlighting by chemistry (LFP, NMC, NCA, ALL).
    """
    selected_chem = (chemistry.upper() if chemistry else "ALL")
    if selected_chem not in ["LFP", "NMC", "NCA", "ALL"]:
        selected_chem = "ALL"

    components = []
    for part in PARTS_GUIDE_DATA:
        # Clone and customize notes for selected chemistry
        p = dict(part)
        chem_notes = p.get("chemistry_specific_notes", {})
        if selected_chem in chem_notes:
            p["active_chemistry_note"] = chem_notes[selected_chem]
        else:
            p["active_chemistry_note"] = chem_notes.get("GENERAL", "")
        components.append(p)

    return {
        "title": "Comprehensive Battery Parts, Materials & Circularity Guide",
        "subtitle": "Explore the 9 core high-voltage EV battery components, their raw material composition, second-life suitability, recycling pathways, and safety protocols.",
        "active_chemistry": selected_chem,
        "available_chemistries": ["ALL", "LFP", "NMC", "NCA"],
        "chemistry_summaries": {
            "LFP": {
                "full_name": "Lithium Iron Phosphate (LiFePO4)",
                "thermal_runaway_threshold": "> 270°C (Extremely Stable)",
                "cycle_life_range": "3,000 – 6,000+ full cycles",
                "critical_minerals": ["Lithium", "Iron", "Phosphorus", "Graphite"],
                "cobalt_nickel_free": True,
                "circular_priority": "Ideal candidate for second-life stationary storage. Recycling prioritizes high-yield lithium carbonate extraction.",
            },
            "NMC": {
                "full_name": "Nickel Manganese Cobalt Oxide (LiNixMnyCozO2)",
                "thermal_runaway_threshold": "~ 150°C – 210°C (Requires Thermal Management)",
                "cycle_life_range": "1,500 – 2,500 full cycles",
                "critical_minerals": ["Lithium", "Nickel", "Cobalt", "Manganese", "Graphite"],
                "cobalt_nickel_free": False,
                "circular_priority": "High recycling commercial value. Closed-loop hydrometallurgical recovery extracts critical battery-grade metal sulfates.",
            },
            "NCA": {
                "full_name": "Nickel Cobalt Aluminum Oxide (LiNiCoAlO2)",
                "thermal_runaway_threshold": "~ 150°C – 190°C",
                "cycle_life_range": "1,200 – 2,000 full cycles",
                "critical_minerals": ["Lithium", "Nickel", "Cobalt", "Aluminum"],
                "cobalt_nickel_free": False,
                "circular_priority": "High energy density traction chemistry. High hydrometallurgical recycling yield.",
            },
        },
        "component_count": len(components),
        "components": components,
        "safety_advisory": (
            "High-Voltage Warning: Traction battery packs operate at lethal voltages between 300V and 800V DC. "
            "Never attempt to open, dismantle, or harvest cells from an EV battery pack without certified high-voltage "
            "training (NFPA 70E / OSHA HV), personal protective equipment, and specialized insulated tooling."
        ),
    }

