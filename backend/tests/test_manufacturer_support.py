"""
Unit tests for the Verified Vehicle Manufacturer Support Directory & Advisory workflow.

Verifies all requirements from EVolve AI - Verified Manufacturer Support Contacts:
  1. A replacement recommendation for a vehicle with verified manufacturer support information.
  2. A vehicle whose manufacturer is known but country is unknown (handles confirmation/selection fallback).
  3. A missing or unverified phone number (phone action disabled, safe official portal message shown).
  4. An outdated contact record (verification expired; call action disabled, fallback to official website).
  5. A model prediction that suggests replacement but lacks diagnostic confirmation (preliminary estimate).
  6. A confirmed diagnostic replacement recommendation (distinct confirmed status).
  7. A critical battery warning (safety override prioritizing stop-use and qualified roadside assistance).
  8. A manufacturer whose official website offers only a service-centre locator (locator-only).
  9. Verification of API endpoints GET /api/manufacturers/support and GET /api/manufacturers/directory.
"""

from fastapi.testclient import TestClient

from app.database.base import session_scope
from app.database.models import ManufacturerSupport
from app.main import app
from app.services import manufacturer_support


def test_verified_manufacturer_support_tata():
    """Requirement 1: Vehicle with verified manufacturer support information."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="Tata Motors",
            country_code="IN",
            model="Nexon EV Max",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        assert advisory["heading"] == "Verify Before You Replace"
        assert advisory["advisory_tier"] == "PRELIMINARY_PREDICTION"
        assert advisory["is_preliminary"] is True
        assert advisory["is_diagnostic_confirmed"] is False

        contact = advisory["contact"]
        assert contact["manufacturer_name"] == "Tata Passenger Electric Mobility"
        assert contact["verification_status"] == "VERIFIED"
        assert contact["can_call"] is True
        assert contact["support_phone"] == "1800 209 8282"
        assert contact["call_link"] == "tel:+9118002098282"
        assert "ev.tatamotors.com" in contact["support_url"]
        assert contact["service_locator_url"] is not None
        assert "dealer" in contact["service_locator_url"] or "locate" in contact["service_locator_url"]
        assert "official manufacturer website" in contact["source_label"].lower()
        assert len(advisory["questions_to_ask"]) == 8


def test_known_manufacturer_unknown_country():
    """Requirement 2: Manufacturer is known but country is unknown."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="Tata",
            country_code=None,  # Country omitted / unknown
            model="Nexon EV",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        assert advisory["vehicle_info"]["country_known"] is False
        # When country is not confirmed, directory provides available choices
        assert advisory["available_manufacturers"] is not None or advisory["contact"]["country_code"] == "IN"
        assert advisory["heading"] == "Verify Before You Replace"


def test_missing_or_unverified_phone_number():
    """Requirement 3: Missing or unverified phone number."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="UnknownBrandEV",
            country_code="IN",
            model="Experimental Beta",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        contact = advisory["contact"]
        assert contact["can_call"] is False
        assert contact["support_phone"] is None
        assert contact["call_link"] is None
        assert "Visit the manufacturer's official website" in contact["phone_fallback_message"] or "Please select your vehicle brand" in contact["phone_fallback_message"]
        # Must never fabricate a phone number
        assert contact["support_phone_raw"] is None


def test_outdated_contact_record():
    """Requirement 4: Outdated contact record."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="Legacy Volt Motors",
            country_code="IN",
            model="Volt 1",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        contact = advisory["contact"]
        assert contact["verification_status"] == "OUTDATED"
        # Outdated records must NOT allow clicking call as verified official
        assert contact["can_call"] is False
        assert contact["call_link"] is None
        assert "verification has expired" in contact["phone_fallback_message"].lower()


def test_preliminary_prediction_without_diagnostic_confirmation():
    """Requirement 5: Model prediction suggesting replacement without diagnostic confirmation."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="MG",
            country_code="IN",
            model="ZS EV",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        assert advisory["advisory_tier"] == "PRELIMINARY_PREDICTION"
        assert advisory["is_preliminary"] is True
        assert advisory["is_diagnostic_confirmed"] is False
        assert "Replacement is not yet confirmed" in advisory["evidence_statement"]
        assert "Verify Before You Replace" in advisory["heading"]
        assert "Before spending money, contact your vehicle manufacturer" in advisory["advisory_message"]


def test_confirmed_diagnostic_replacement_recommendation():
    """Requirement 6: Confirmed diagnostic replacement recommendation."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="MG",
            country_code="IN",
            model="ZS EV",
            is_diagnostic_confirmed=True,
            has_critical_warning=False,
            db=db,
        )

        assert advisory["advisory_tier"] == "DIAGNOSTIC_CONFIRMED"
        assert advisory["is_preliminary"] is False
        assert advisory["is_diagnostic_confirmed"] is True
        assert "diagnostic physical/BMS test results" in advisory["evidence_statement"]
        assert "Diagnostic Confirmation Recorded" in advisory["heading"]


def test_critical_battery_warning_safety_override():
    """Requirement 7: Critical battery warning triggers immediate stop-use guidance."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="Mahindra",
            country_code="IN",
            model="XUV400",
            is_diagnostic_confirmed=False,
            has_critical_warning=True,
            db=db,
        )

        assert advisory["advisory_tier"] == "CRITICAL_SAFETY_WARNING"
        assert advisory["has_critical_warning"] is True
        assert "Critical Battery Warning" in advisory["heading"]
        assert "Do NOT continue driving" in advisory["advisory_message"]
        assert "roadside assistance" in advisory["advisory_message"].lower()


def test_locator_only_manufacturer():
    """Requirement 8: Official website offers only a service-centre locator (no verified phone)."""
    with session_scope() as db:
        advisory = manufacturer_support.build_manufacturer_advisory(
            brand="Quantum Mobility",
            country_code="IN",
            model="Quantum EV",
            is_diagnostic_confirmed=False,
            has_critical_warning=False,
            db=db,
        )

        contact = advisory["contact"]
        assert contact["verification_status"] == "LOCATOR_ONLY"
        assert contact["can_call"] is False
        assert contact["support_phone"] is None
        assert contact["service_locator_url"] == "https://quantum-ev.com/service-locator"
        assert "Official phone number unavailable" in contact["phone_fallback_message"]


def test_manufacturer_support_api_endpoints():
    """Requirement 9: Test GET /api/manufacturers/support and GET /api/manufacturers/directory."""
    client = TestClient(app)

    # 1. Support endpoint for Tata
    res = client.get("/api/manufacturers/support?brand=Tata&country=IN&model=Nexon+EV")
    assert res.status_code == 200
    data = res.json()
    assert data["heading"] == "Verify Before You Replace"
    assert data["contact"]["support_phone"] == "1800 209 8282"
    assert data["contact"]["can_call"] is True

    # 2. Support endpoint with diagnostic confirmation
    res_diag = client.get(
        "/api/manufacturers/support?brand=Tata&country=IN&diagnostic_confirmed=true"
    )
    assert res_diag.status_code == 200
    assert res_diag.json()["is_diagnostic_confirmed"] is True
    assert res_diag.json()["advisory_tier"] == "DIAGNOSTIC_CONFIRMED"

    # 3. Support endpoint with critical warning
    res_crit = client.get(
        "/api/manufacturers/support?brand=Tata&country=IN&critical_warning=true"
    )
    assert res_crit.status_code == 200
    assert res_crit.json()["advisory_tier"] == "CRITICAL_SAFETY_WARNING"

    # 4. Directory endpoint
    res_dir = client.get("/api/manufacturers/directory?country=IN")
    assert res_dir.status_code == 200
    dir_data = res_dir.json()
    assert dir_data["count"] >= 8
    mfg_names = [m["manufacturer_name"] for m in dir_data["manufacturers"]]
    assert any("Tata" in name for name in mfg_names)
    assert any("MG" in name for name in mfg_names)
    assert any("Mahindra" in name for name in mfg_names)
