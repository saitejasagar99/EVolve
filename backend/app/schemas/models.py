"""Pydantic request/response schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class DemoLoadRequest(BaseModel):
    count: int = Field(75, ge=10, le=400, description="Number of synthetic batteries")
    reset: bool = Field(True, description="Drop and recreate tables first")


class DemoLoadResponse(BaseModel):
    status: str
    batteries: int
    vehicles: int
    fleets: int
    handlers: int
    notice: str
    simulated: bool = True


class SimulateRequest(BaseModel):
    fleet_scale: float = Field(1.0, ge=0.1, le=5.0)
    repair_capacity: int | None = Field(None, ge=0, le=10000)
    second_life_capacity: int | None = Field(None, ge=0, le=10000)
    recycling_capacity: int | None = Field(None, ge=0, le=10000)
    collection_capacity: int | None = Field(None, ge=0, le=100000)
    collection_trips: int | None = Field(None, ge=0, le=1000)
    trip_capacity_units: int | None = Field(None, ge=1, le=200)
    intervention_rate: float = Field(1.0, ge=0.0, le=1.0)


class BatchRequest(BaseModel):
    trip_capacity_units: int = Field(6, ge=1, le=200)
    trips_per_month: int = Field(8, ge=0, le=1000)
    max_trips: int | None = Field(None, ge=0, le=1000)


class ExplainRequest(BaseModel):
    battery_id: str
    allow_external: bool = Field(
        False, description="False forces the deterministic local explainer"
    )


class ExplainResponse(BaseModel):
    battery_id: str
    explanation: str
    source: Literal["genai", "local-fallback"]
    genai_key_configured: bool
    fallback_reason: str | None = None
    grounded_in: str
    facts_used: dict[str, Any]
    note: str
    disclaimer: str


class InterventionDecision(BaseModel):
    pathway: Literal[
        "CONTINUE_USE", "REPAIR_REFURBISHMENT", "SECOND_LIFE_ASSESSMENT", "EOL_CANDIDATE"
    ]
    decided_by: str = Field("operator", max_length=120)
    note: str = ""


class TrainResponse(BaseModel):
    status: str
    metrics: dict[str, Any]


class HealthResponse(BaseModel):
    status: str
    models_trained: bool
    genai_key_configured: bool
    genai_mode: str
    batteries: int
    provenance: dict[str, Any]


# ---------------------------------------------------------------------------
# Customer EV Battery Schemas
# ---------------------------------------------------------------------------

class CustomerBatteryInputRequest(BaseModel):
    """Simple user input provided by an ordinary EV owner."""

    vehicle_brand: str = Field(..., description="Brand of the EV, e.g. Tata, MG, Mahindra")
    vehicle_model: str = Field(..., description="Model of the EV, e.g. Nexon EV")
    purchase_year: int = Field(..., ge=2015, le=2026, description="Purchase year")
    odometer_km: float | None = Field(None, ge=0, description="Approximate current odometer reading in km")

    daily_driving: str = Field("20_50", description="less_20 | 20_50 | 50_100 | more_100 | unknown")
    charging_frequency: str = Field("3_5_week", description="daily | 3_5_week | 1_2_week | less_week | unknown")
    charging_method: str = Field("home", description="home | fast | both | mostly_public | unknown")
    driving_pattern: str = Field("city", description="city | highway | mixed | unknown")

    range_condition: str = Field("same", description="same | slightly_reduced | significantly_reduced | much_lower | unknown")
    charging_condition: str = Field("normal", description="normal | slightly_slower | much_slower | frequent_problems | unknown")
    temperature_condition: str = Field("normal", description="normal | sometimes_warm | frequently_hot | unknown")
    warning_condition: str = Field("none", description="none | occasional | frequent | critical | unknown")
    range_fluctuation: str = Field("never", description="never | occasionally | frequently | very_frequently | unknown")

    city: str = Field("Hyderabad", description="Primary operating city")
    state: str = Field("Telangana", description="Primary operating state")
    pincode: str | None = Field(None, description="Optional postal code")

    # Optional Advanced Technical Data (only if user explicitly opens advanced section)
    battery_capacity_kwh: float | None = Field(None, ge=1, le=250)
    battery_chemistry: str | None = Field(None, description="LFP | NMC")
    soh_input: float | None = Field(None, ge=10, le=100)
    cycle_count_input: int | None = Field(None, ge=0, le=10000)
    voltage_input: float | None = Field(None, ge=20, le=900)
    current_input: float | None = Field(None, ge=-500, le=500)
    temperature_input: float | None = Field(None, ge=-10, le=80)
    internal_resistance_mohm: float | None = Field(None, ge=1, le=500)
    dod_input: float | None = Field(None, ge=0.0, le=1.0)

    is_demo: bool = False


class CustomerPreparationResponse(BaseModel):
    draft_id: str
    vehicle: dict[str, Any]
    summary: dict[str, Any]
    confidence: dict[str, Any]
    technical_details: dict[str, Any]


class BatteryCollectionByIdPayload(BaseModel):
    notes: str | None = ""
    contact_name: str | None = None
    contact_phone: str | None = None
    pickup_address: str | None = None
    city: str | None = None
    state: str | None = None
    preferred_date: str | None = None


class CustomerCollectionRequest(BaseModel):
    battery_id: str
    contact_name: str = Field(..., min_length=2)
    contact_phone: str = Field(..., min_length=6)
    pickup_address: str = Field(..., min_length=5)
    city: str
    state: str
    preferred_date: str = Field(..., description="Preferred date, e.g. YYYY-MM-DD")
    notes: str | None = ""


class CustomerSecondLifeRequest(BaseModel):
    battery_id: str
    contact_name: str = Field(..., min_length=2)
    contact_phone: str = Field(..., min_length=6)
    listing_intent: str = Field("ASSESSMENT_AND_MARKETPLACE", description="ASSESSMENT_ONLY | ASSESSMENT_AND_MARKETPLACE")
    expected_price_inr: float | None = None
    notes: str | None = ""


# --- User Authentication & Profile Schemas ----------------------------------

class UserRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=160, description="Full name")
    username: str = Field(..., min_length=3, max_length=30, description="Unique username")
    email: str = Field(..., description="Email address for OTP verification")
    phone: str = Field(..., description="Indian phone number (e.g. +91 9876543210)")
    role: str = Field("CUSTOMER", description="User role: CUSTOMER | CONSUMER")
    aadhaar_number: str | None = Field(None, description="Optional 12-digit Indian Aadhaar number")

    # EV Owner details (Required if role == CUSTOMER)
    vehicle_number: str | None = Field(None, description="Vehicle registration number (e.g. TS09AB1234)")
    vehicle_manufacturer: str | None = Field(None, description="Vehicle manufacturer (e.g. Tata, MG)")
    vehicle_model: str | None = Field(None, description="Vehicle model (e.g. Nexon EV)")
    vehicle_purchase_year: int | None = Field(None, ge=2015, le=2026, description="Purchase year")
    odometer_km: float = Field(0.0, ge=0.0, le=1000000.0, description="Approximate current odometer in km")

    # Location & Consumer details
    city: str = Field("Hyderabad", description="City")
    state: str = Field("Telangana", description="State")
    pincode: str | None = Field(None, description="Postal PIN code")
    intended_battery_application: str | None = Field(None, description="Intended application for second-life battery")

    password: str = Field(..., min_length=8, description="Password meeting security criteria")
    confirm_password: str = Field(..., min_length=8, description="Confirm password matching above")


class VerifyEmailRequest(BaseModel):
    email: str
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")


class ResendOtpRequest(BaseModel):
    email: str
    purpose: str = Field("REGISTRATION", description="REGISTRATION | PASSWORD_RESET")


class UserLoginRequest(BaseModel):
    email: str = Field(..., description="Registered email address")
    password: str = Field(..., description="User password")


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., description="Registered email address")


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., description="Registered email address")
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")
    new_password: str = Field(..., min_length=8, description="New secure password")
    confirm_password: str = Field(..., min_length=8, description="Confirm new password")


class UserProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=160)
    phone: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    odometer_km: float | None = Field(None, ge=0.0)
    vehicle_number: str | None = None
    vehicle_manufacturer: str | None = None
    vehicle_model: str | None = None
    vehicle_purchase_year: int | None = Field(None, ge=2015, le=2026)


class UserSafeResponse(BaseModel):
    id: int
    full_name: str
    username: str
    email: str
    masked_email: str
    phone: str
    masked_phone: str
    masked_aadhaar: str
    role: str
    email_verified: bool
    created_at: str
    vehicle: dict[str, Any] | None = None


class DeleteAccountRequest(BaseModel):
    password: str | None = Field(None, description="Password to confirm account deletion")
    confirmation: str | None = Field(None, description="Explicit confirmation keyword")