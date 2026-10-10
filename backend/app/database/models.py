"""SQLAlchemy ORM models for the EVolve AI circularity platform.

Covers the full battery lifecycle: fleet -> vehicle -> battery -> readings ->
predictions -> anomalies -> interventions -> collection -> processing, plus
traceability, forecasting and scenario persistence.

Design notes
------------
* `String` + `Float` are used throughout instead of dialect enums, so the same
  schema runs on SQLite and PostgreSQL unchanged.
* Every lifecycle transition is an append-only row in `lifecycle_events`.
  Nothing is ever mutated in place, which is what makes the audit trail
  defensible as "EPR-ready evidence" (evidence, not certified compliance).
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Fleet & vehicle
# ---------------------------------------------------------------------------

class Fleet(Base):
    __tablename__ = "fleets"

    id: Mapped[int] = mapped_column(primary_key=True)
    fleet_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    operator_name: Mapped[str] = mapped_column(String(160))
    zone: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80))
    priority: Mapped[str] = mapped_column(String(16), default="Standard")  # Standard/Critical
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="fleet")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    model_name: Mapped[str] = mapped_column(String(120))
    fleet_id: Mapped[int] = mapped_column(ForeignKey("fleets.id"), index=True)
    zone: Mapped[str] = mapped_column(String(80), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    in_service_since: Mapped[datetime] = mapped_column(DateTime)
    annual_distance_km: Mapped[float] = mapped_column(Float, default=0.0)
    distance_travelled_km: Mapped[float] = mapped_column(Float, default=0.0)
    priority: Mapped[str] = mapped_column(String(16), default="Standard")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    fleet: Mapped[Fleet] = relationship(back_populates="vehicles")
    batteries: Mapped[list["Battery"]] = relationship(back_populates="vehicle")


# ---------------------------------------------------------------------------
# Battery & telemetry
# ---------------------------------------------------------------------------

class Battery(Base):
    __tablename__ = "batteries"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_uid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    """Unique Battery Lifecycle ID (BLID) used for end-to-end traceability."""

    battery_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), index=True)
    chemistry: Mapped[str] = mapped_column(String(16))          # NMC / LFP
    rated_capacity_kwh: Mapped[float] = mapped_column(Float)
    manufactured_on: Mapped[datetime] = mapped_column(DateTime)
    installed_on: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    warranty_years: Mapped[int] = mapped_column(Integer, default=8)

    # --- latest BMS snapshot ---
    current_soh: Mapped[float] = mapped_column(Float)
    soc_pct: Mapped[float] = mapped_column(Float)
    voltage_v: Mapped[float] = mapped_column(Float)
    current_a: Mapped[float] = mapped_column(Float)
    temperature_c: Mapped[float] = mapped_column(Float)
    peak_temperature_c: Mapped[float] = mapped_column(Float)
    charging_cycles: Mapped[int] = mapped_column(Integer)
    charging_events: Mapped[int] = mapped_column(Integer)
    fast_charge_ratio: Mapped[float] = mapped_column(Float)
    energy_delivered_kwh: Mapped[float] = mapped_column(Float)
    dc_resistance_mohm: Mapped[float] = mapped_column(Float)
    cell_voltage_spread_mv: Mapped[float] = mapped_column(Float)
    measured_capacity_fade_pct: Mapped[float] = mapped_column(Float)

    # --- data-quality counters (Module 1) ---
    missing_reading_count: Mapped[int] = mapped_column(Integer, default=0)
    duplicate_record_count: Mapped[int] = mapped_column(Integer, default=0)
    invalid_range_count: Mapped[int] = mapped_column(Integer, default=0)
    outlier_count: Mapped[int] = mapped_column(Integer, default=0)
    reading_count: Mapped[int] = mapped_column(Integer, default=0)
    history_months: Mapped[int] = mapped_column(Integer, default=0)

    # --- lifecycle state (denormalised for fast listing; events are truth) ---
    lifecycle_status: Mapped[str] = mapped_column(String(48), default="IN_SERVICE", index=True)
    collection_status: Mapped[str] = mapped_column(String(48), default="NOT_REQUIRED")
    second_life_status: Mapped[str] = mapped_column(String(48), default="NOT_ASSESSED")
    recycling_status: Mapped[str] = mapped_column(String(48), default="NOT_SENT")
    last_inspection_on: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), default="SIMULATED")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    # --- owner & sharing extension (Requirement 1, 2, 3) ---
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    vehicle_manufacturer: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vehicle_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purchase_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    odometer_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    sharing_status: Mapped[str] = mapped_column(String(48), default="PRIVATE", index=True)
    sharing_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    second_life_suitability: Mapped[str | None] = mapped_column(String(48), default="NOT_ASSESSED")
    estimated_remaining_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    future_risk: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reported_condition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    eol_reported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    eol_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_professionally_assessed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    vehicle: Mapped[Vehicle] = relationship(back_populates="batteries")
    owner: Mapped[User | None] = relationship(back_populates="batteries")
    readings: Mapped[list["BatteryReading"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )
    predictions: Mapped[list["HealthPrediction"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )
    lifecycle_events: Mapped[list["LifecycleEvent"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )
    interventions: Mapped[list["WasteIntervention"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )
    disposal_reports: Mapped[list["BatteryDisposalReport"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )
    enquiries: Mapped[list["BatteryEnquiry"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan"
    )


class BatteryReading(Base):
    """One monthly BMS reading. Powers the degradation trend charts."""

    __tablename__ = "battery_readings"
    __table_args__ = (
        UniqueConstraint("battery_id", "month_index", name="uq_reading_battery_month"),
        Index("ix_reading_battery_month", "battery_id", "month_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    month_index: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[datetime] = mapped_column(DateTime)

    soh: Mapped[float | None] = mapped_column(Float, nullable=True)
    soc_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    voltage_v: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_a: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    charging_cycles: Mapped[int | None] = mapped_column(Integer, nullable=True)
    energy_delivered_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_km: Mapped[float | None] = mapped_column(Float, nullable=True)

    battery: Mapped[Battery] = relationship(back_populates="readings")


# ---------------------------------------------------------------------------
# ML output
# ---------------------------------------------------------------------------

class HealthPrediction(Base):
    __tablename__ = "health_predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    model_version: Mapped[str] = mapped_column(String(48))

    soh_predicted: Mapped[float] = mapped_column(Float)
    soh_low: Mapped[float] = mapped_column(Float)
    soh_high: Mapped[float] = mapped_column(Float)

    eol_in_months: Mapped[float] = mapped_column(Float)
    eol_low_months: Mapped[float] = mapped_column(Float)
    eol_high_months: Mapped[float] = mapped_column(Float)

    anomaly_score: Mapped[float] = mapped_column(Float)
    anomaly_flagged: Mapped[bool] = mapped_column(Boolean, default=False)

    degradation_per_month: Mapped[float] = mapped_column(Float)
    data_confidence: Mapped[float] = mapped_column(Float)

    battery: Mapped[Battery] = relationship(back_populates="predictions")


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    kind: Mapped[str] = mapped_column(String(48))
    severity: Mapped[float] = mapped_column(Float)
    evidence: Mapped[str] = mapped_column(Text)
    #: An anomaly is a SIGNAL, never a confirmed fault. This column exists to
    #: make that distinction explicit in the database, not just the UI.
    status: Mapped[str] = mapped_column(String(32), default="TECHNICAL_REVIEW")


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    performed_on: Mapped[datetime] = mapped_column(DateTime)
    kind: Mapped[str] = mapped_column(String(64))
    notes: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------------------
# Waste prevention
# ---------------------------------------------------------------------------

class WasteIntervention(Base):
    __tablename__ = "waste_interventions"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    pathway: Mapped[str] = mapped_column(String(48), index=True)
    """CONTINUE_USE | REPAIR_REFURBISHMENT | SECOND_LIFE_ASSESSMENT | EOL_CANDIDATE"""

    rationale: Mapped[str] = mapped_column(Text)
    rules_fired: Mapped[str] = mapped_column(Text)          # JSON list of rule names
    estimated_avoided_units: Mapped[float] = mapped_column(Float, default=0.0)
    estimated_cost_inr: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(32), default="PROPOSED")
    decided_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    battery: Mapped[Battery] = relationship(back_populates="interventions")


class WasteForecast(Base):
    __tablename__ = "waste_forecasts"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    horizon_months: Mapped[int] = mapped_column(Integer)
    predicted_eol_units: Mapped[int] = mapped_column(Integer)
    baseline_eol_units: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

class ProcessingHandler(Base):
    """Downstream recycler / refurbisher capacity."""

    __tablename__ = "processing_handlers"

    id: Mapped[int] = mapped_column(primary_key=True)
    handler_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(48))       # RECYCLER / REFURBISHER
    zone: Mapped[str] = mapped_column(String(80))
    city: Mapped[str] = mapped_column(String(80))
    monthly_capacity_units: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    #: Informal-sector operators are common in the Indian EOL ecosystem. This is
    #: a supply-chain RISK signal for traceability, not a compliance judgement.
    certification_status: Mapped[str] = mapped_column(String(48), default="UNVERIFIED")


class CollectionTask(Base):
    __tablename__ = "collection_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    priority_score: Mapped[float] = mapped_column(Float, index=True)
    priority_band: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", index=True)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    collected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    batch_id: Mapped[int | None] = mapped_column(ForeignKey("collection_batches.id"), nullable=True)
    factors: Mapped[str] = mapped_column(Text, default="{}")   # JSON explanation


class CollectionBatch(Base):
    __tablename__ = "collection_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_code: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    zone: Mapped[str] = mapped_column(String(80))
    priority_band: Mapped[str] = mapped_column(String(16))
    total_units: Mapped[int] = mapped_column(Integer)
    estimated_distance_km: Mapped[float] = mapped_column(Float)
    estimated_cost_inr: Mapped[float] = mapped_column(Float)
    window_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    window_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="PLANNED")


class RecyclingRecord(Base):
    __tablename__ = "recycling_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    handler_id: Mapped[int | None] = mapped_column(ForeignKey("processing_handlers.id"), nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    material_recovered_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    route: Mapped[str] = mapped_column(String(32), default="UNASSIGNED")  # RECYCLE/SECOND_LIFE/REUSE
    evidence_ref: Mapped[str] = mapped_column(String(120), default="")


# ---------------------------------------------------------------------------
# Traceability
# ---------------------------------------------------------------------------

class LifecycleEvent(Base):
    """Append-only audit trail. This table is the traceability backbone."""

    __tablename__ = "lifecycle_events"
    __table_args__ = (Index("ix_lifecycle_battery_time", "battery_id", "occurred_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    event: Mapped[str] = mapped_column(String(64), index=True)
    location: Mapped[str] = mapped_column(String(120), default="")
    handler: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(32), default="RECORDED")
    evidence_ref: Mapped[str] = mapped_column(String(120), default="")
    actor: Mapped[str] = mapped_column(String(120), default="system")

    battery: Mapped[Battery] = relationship(back_populates="lifecycle_events")


# ---------------------------------------------------------------------------
# Scenarios & plans
# ---------------------------------------------------------------------------

class ScenarioResult(Base):
    __tablename__ = "scenario_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    label: Mapped[str] = mapped_column(String(160))
    params: Mapped[str] = mapped_column(Text)       # JSON
    results: Mapped[str] = mapped_column(Text)      # JSON


class ActionPlan(Base):
    __tablename__ = "action_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    horizon: Mapped[str] = mapped_column(String(32))
    items: Mapped[str] = mapped_column(Text)        # JSON list
    source: Mapped[str] = mapped_column(String(32), default="GENERATED")


# ---------------------------------------------------------------------------
# User Authentication & Vehicle Ownership
# ---------------------------------------------------------------------------

class User(Base):
    """
    Authenticated EVolve AI user account.
    Supports email OTP verification, password hashing, and role-based access.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160))
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(32))
    aadhaar_encrypted: Mapped[str | None] = mapped_column(String(256), nullable=True)
    aadhaar_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    role: Mapped[str] = mapped_column(String(32), default="CUSTOMER")  # CUSTOMER / CONSUMER / RECYCLER / ADMIN
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    intended_application: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    vehicles: Mapped[list["UserVehicle"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    assessments: Mapped[list["CustomerAssessment"]] = relationship(back_populates="user")
    batteries: Mapped[list["Battery"]] = relationship(back_populates="owner")
    disposal_reports: Mapped[list["BatteryDisposalReport"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    enquiries_submitted: Mapped[list["BatteryEnquiry"]] = relationship(
        back_populates="consumer", cascade="all, delete-orphan"
    )
    fleet_uploads: Mapped[list["FleetUpload"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    fleet_analyses: Mapped[list["FleetAnalysis"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )



class UserVehicle(Base):
    """
    User-registered EV vehicle.
    Pre-populates the Battery Intelligence workflow so users never re-enter specs.
    """

    __tablename__ = "user_vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    vehicle_number: Mapped[str] = mapped_column(String(32), index=True)
    manufacturer: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(120))
    purchase_year: Mapped[int] = mapped_column(Integer)
    odometer_km: Mapped[float] = mapped_column(Float, default=0.0)
    city: Mapped[str] = mapped_column(String(80), default="Hyderabad")
    state: Mapped[str] = mapped_column(String(80), default="Telangana")
    pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    user: Mapped[User] = relationship(back_populates="vehicles")


class EmailOTP(Base):
    """
    Stores cryptographically hashed email OTP verification codes.
    Features 5-minute expiry, attempt tracking, and invalidation upon verification.
    """

    __tablename__ = "email_otps"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(160), index=True)
    purpose: Mapped[str] = mapped_column(String(32), default="REGISTRATION")  # REGISTRATION / PASSWORD_RESET
    otp_hash: Mapped[str] = mapped_column(String(128))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# ---------------------------------------------------------------------------
# Customer EV Battery Intelligence
# ---------------------------------------------------------------------------

class CustomerAssessment(Base):
    """
    Stores customer-submitted EV battery assessments.
    Enables simple user input -> derived features -> ML predictions -> circularity actions.
    """

    __tablename__ = "customer_assessments"

    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    battery_id: Mapped[int | None] = mapped_column(ForeignKey("batteries.id"), nullable=True, index=True)
    battery_uid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    user: Mapped[User | None] = relationship(back_populates="assessments")

    # Step 1: Vehicle Information
    vehicle_brand: Mapped[str] = mapped_column(String(64))
    vehicle_model: Mapped[str] = mapped_column(String(120))
    purchase_year: Mapped[int] = mapped_column(Integer)
    odometer_km: Mapped[float] = mapped_column(Float, default=0.0)

    # Step 2: Usage Information
    daily_driving: Mapped[str] = mapped_column(String(48), default="20_50")
    charging_frequency: Mapped[str] = mapped_column(String(48), default="3_5_week")
    charging_method: Mapped[str] = mapped_column(String(48), default="home")
    driving_pattern: Mapped[str] = mapped_column(String(48), default="city")

    # Step 3: Battery Experience
    range_condition: Mapped[str] = mapped_column(String(48), default="same")
    charging_condition: Mapped[str] = mapped_column(String(48), default="normal")
    temperature_condition: Mapped[str] = mapped_column(String(48), default="normal")
    warning_condition: Mapped[str] = mapped_column(String(48), default="none")
    range_fluctuation: Mapped[str] = mapped_column(String(48), default="never")

    # Step 4: Location
    city: Mapped[str] = mapped_column(String(80), default="Hyderabad")
    state: Mapped[str] = mapped_column(String(80), default="Telangana")
    pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Step 5: Optional Advanced Data
    battery_capacity_kwh: Mapped[float | None] = mapped_column(Float, nullable=True)
    battery_chemistry: Mapped[str | None] = mapped_column(String(16), nullable=True)
    soh_input: Mapped[float | None] = mapped_column(Float, nullable=True)
    cycle_count_input: Mapped[int | None] = mapped_column(Integer, nullable=True)
    voltage_input: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_input: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature_input: Mapped[float | None] = mapped_column(Float, nullable=True)
    internal_resistance_mohm: Mapped[float | None] = mapped_column(Float, nullable=True)
    dod_input: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Intelligence & Evaluation Outputs
    confidence_score: Mapped[float] = mapped_column(Float, default=0.85)
    confidence_band: Mapped[str] = mapped_column(String(32), default="HIGH")

    soh_predicted: Mapped[float] = mapped_column(Float)
    soh_health_band: Mapped[str] = mapped_column(String(32))  # Good / Fair / Needs Attention / Critical
    future_risk: Mapped[str] = mapped_column(String(32))      # Low / Medium / High
    estimated_remaining_years: Mapped[float] = mapped_column(Float)
    second_life_potential: Mapped[str] = mapped_column(String(32))  # High / Medium / Low
    recommended_action: Mapped[str] = mapped_column(String(64))
    recommendation_title: Mapped[str] = mapped_column(String(160))
    recommendation_message: Mapped[str] = mapped_column(Text)

    # Transparent Explainability Payload
    feature_provenance: Mapped[str] = mapped_column(Text, default="{}")
    derived_features: Mapped[str] = mapped_column(Text, default="{}")
    why_explanation: Mapped[str] = mapped_column(Text, default="[]")
    ai_explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)

    # Downstream Circularity Actions
    collection_status: Mapped[str] = mapped_column(String(32), default="NOT_REQUESTED")
    collection_preferred_date: Mapped[str | None] = mapped_column(String(48), nullable=True)
    collection_contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    collection_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    collection_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    second_life_status: Mapped[str] = mapped_column(String(32), default="NOT_REQUESTED")
    second_life_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Battery Disposal Reports & Consumer Enquiries
# ---------------------------------------------------------------------------

class BatteryDisposalReport(Base):
    """
    Stores customer-submitted End-of-Life / Discarded battery assessment reports.
    Connects EV owners to authorized diagnostic evaluation and recycling channels.
    """

    __tablename__ = "battery_disposal_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    reporting_reason: Mapped[str] = mapped_column(String(120))
    current_condition: Mapped[str] = mapped_column(String(64))  # Working / Reduced performance / Damaged / Unknown
    professionally_assessed: Mapped[bool] = mapped_column(Boolean, default=False)
    assessment_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    collection_city: Mapped[str] = mapped_column(String(80))
    collection_state: Mapped[str] = mapped_column(String(80))
    collection_pincode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    sharing_consent: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(48), default="PENDING_ASSESSMENT", index=True)
    supporting_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    battery: Mapped[Battery] = relationship(back_populates="disposal_reports")
    user: Mapped[User] = relationship(back_populates="disposal_reports")


class BatteryEnquiry(Base):
    """
    Stores non-binding circular enquiries submitted by consumers regarding eligible shared batteries.
    Facilitates transparent communication without exposing customer personal details.
    """

    __tablename__ = "battery_enquiries"

    id: Mapped[int] = mapped_column(primary_key=True)
    enquiry_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id"), index=True)
    consumer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    enquiry_purpose: Mapped[str] = mapped_column(String(160))
    intended_application: Mapped[str | None] = mapped_column(String(160), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    consumer_name: Mapped[str] = mapped_column(String(160))
    consumer_masked_email: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), default="SUBMITTED")  # SUBMITTED / REVIEWED / RESPONDED / CLOSED
    response_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    battery: Mapped[Battery] = relationship(back_populates="enquiries")
    consumer: Mapped[User] = relationship(back_populates="enquiries_submitted")


# ---------------------------------------------------------------------------
# Fleet Intelligence & Private Multi-Vehicle Datasets
# ---------------------------------------------------------------------------

class FleetUpload(Base):
    """
    Stores an uploaded private fleet dataset (CSV) and its validation & column mapping status.
    Privacy-first: strictly isolated to the uploading user or session.
    """

    __tablename__ = "fleet_uploads"

    id: Mapped[int] = mapped_column(primary_key=True)
    upload_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    filename: Mapped[str] = mapped_column(String(256))
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    valid_rows: Mapped[int] = mapped_column(Integer, default=0)
    error_rows: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="UPLOADED", index=True)  # UPLOADED, VALIDATED, MAPPED, ANALYZED

    raw_data_json: Mapped[str] = mapped_column(Text)  # JSON serialized list of rows
    detected_columns_json: Mapped[str] = mapped_column(Text, default="[]")
    validation_report_json: Mapped[str] = mapped_column(Text, default="{}")
    column_mapping_json: Mapped[str] = mapped_column(Text, default="{}")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    user: Mapped[User | None] = relationship(back_populates="fleet_uploads")
    analyses: Mapped[list["FleetAnalysis"]] = relationship(back_populates="upload", cascade="all, delete-orphan")


class FleetAnalysis(Base):
    """
    Stores batch multi-vehicle prediction results and fleet health aggregate analytics.
    """

    __tablename__ = "fleet_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    upload_id: Mapped[int] = mapped_column(ForeignKey("fleet_uploads.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(32), default="COMPLETED", index=True)  # PENDING, COMPLETED, FAILED
    total_vehicles: Mapped[int] = mapped_column(Integer, default=0)
    analysed_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    attention_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_soh_pct: Mapped[float] = mapped_column(Float, default=0.0)
    avg_eol_months: Mapped[float] = mapped_column(Float, default=0.0)

    summary_json: Mapped[str] = mapped_column(Text, default="{}")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    upload: Mapped[FleetUpload] = relationship(back_populates="analyses")
    user: Mapped[User | None] = relationship(back_populates="fleet_analyses")
    records: Mapped[list["FleetVehicleRecord"]] = relationship(back_populates="analysis", cascade="all, delete-orphan")


class FleetVehicleRecord(Base):
    """
    Individual vehicle record prediction outcome within a batch fleet analysis run.
    """

    __tablename__ = "fleet_vehicle_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_id: Mapped[int] = mapped_column(ForeignKey("fleet_analyses.id"), index=True)
    vehicle_id: Mapped[str] = mapped_column(String(120), index=True)
    battery_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    raw_data_json: Mapped[str] = mapped_column(Text, default="{}")
    mapped_features_json: Mapped[str] = mapped_column(Text, default="{}")

    soh_pct: Mapped[float] = mapped_column(Float, default=0.0)
    soh_health_band: Mapped[str] = mapped_column(String(32), default="Good")  # Good, Attention, Critical
    eol_months: Mapped[float] = mapped_column(Float, default=0.0)
    anomaly_score: Mapped[float] = mapped_column(Float, default=0.0)
    future_risk: Mapped[str] = mapped_column(String(32), default="LOW")  # LOW, MEDIUM, HIGH, CRITICAL

    pathway: Mapped[str] = mapped_column(String(64), default="CONTINUE_USE")
    pathway_label: Mapped[str] = mapped_column(String(120), default="Continue use")
    priority_category: Mapped[str] = mapped_column(String(32), default="Normal")  # Critical, Attention, Normal
    recommended_action: Mapped[str] = mapped_column(Text, default="")
    recommendation_title: Mapped[str] = mapped_column(String(160), default="")
    alert_reasons_json: Mapped[str] = mapped_column(Text, default="[]")

    status: Mapped[str] = mapped_column(String(32), default="SUCCESS")  # SUCCESS, FAILED
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    analysis: Mapped[FleetAnalysis] = relationship(back_populates="records")


# ---------------------------------------------------------------------------
# Verified Manufacturer Support Directory
# ---------------------------------------------------------------------------

class ManufacturerSupport(Base):
    """
    Verified vehicle manufacturer customer support directory.
    Stores official contacts for battery replacement verification and diagnostic escalations.
    """

    __tablename__ = "manufacturer_support"

    id: Mapped[int] = mapped_column(primary_key=True)
    manufacturer_id: Mapped[str] = mapped_column(String(64), index=True)
    manufacturer_name: Mapped[str] = mapped_column(String(120))
    brand_aliases_json: Mapped[str] = mapped_column(Text, default="[]")
    country_code: Mapped[str] = mapped_column(String(16), index=True, default="IN")
    country_name: Mapped[str] = mapped_column(String(80), default="India")

    # Official verified contacts
    support_phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    support_phone_normalized: Mapped[str | None] = mapped_column(String(64), nullable=True)
    support_url: Mapped[str] = mapped_column(String(256))
    service_locator_url: Mapped[str | None] = mapped_column(String(256), nullable=True)
    support_hours: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Verification traceability
    source_url: Mapped[str] = mapped_column(String(256))
    source_label: Mapped[str] = mapped_column(
        String(160),
        default="Contact information sourced from the official manufacturer website",
    )
    verified_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    verification_status: Mapped[str] = mapped_column(
        String(32), default="VERIFIED"
    )  # VERIFIED, LOCATOR_ONLY, UNVERIFIED, OUTDATED
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)