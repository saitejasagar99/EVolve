"""
Integration test for Discarded Battery Discovery, Customer Connection,
and Component Identification circular workflow.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database.base import SessionLocal, get_db
from app.database.models import Battery, User
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _login(client: TestClient, email: str = "customer@evolve.ai", password: str = "Evolve@2026") -> str:
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Failed to login {email}: {res.text}"
    return res.json()["access_token"]


def test_discarded_battery_connected_workflow(client: TestClient, db_session):
    # 1. Login as customer (EV Owner)
    cust_token = _login(client, "customer@evolve.ai")
    cust_headers = {"Authorization": f"Bearer {cust_token}"}

    # Fetch customer battery or register one
    cust_profile_res = client.get("/api/customer/batteries", headers=cust_headers)
    if cust_profile_res.status_code == 200 and cust_profile_res.json().get("battery"):
        battery_id = cust_profile_res.json()["battery"]["battery_id"]
    else:
        reg_res = client.post(
            "/api/customer/batteries",
            headers=cust_headers,
            json={
                "vehicle_manufacturer": "Tata",
                "vehicle_model": "Nexon EV Max",
                "purchase_year": 2021,
                "odometer_km": 82000.0,
                "chemistry": "LFP",
                "rated_capacity_kwh": 40.5,
                "reported_condition": "REDUCED_PERFORMANCE",
                "city": "Bengaluru",
                "state": "Karnataka",
            },
        )
        assert reg_res.status_code == 200
        battery_id = reg_res.json()["battery"]["battery_id"]

    # 2. Customer reports battery for End-of-Life / Discarded Assessment
    report_res = client.post(
        f"/api/customer/batteries/{battery_id}/report-eol",
        headers=cust_headers,
        json={
            "reporting_reason": "Reached the end of its useful EV service",
            "current_condition": "Reduced performance",
            "professionally_assessed": True,
            "assessment_notes": "Diagnostic scan showed 35% capacity fade; BMS reports balanced cells.",
            "collection_city": "Bengaluru",
            "collection_state": "Karnataka",
            "collection_pincode": "560001",
            "sharing_consent": True,
            "supporting_details": "Customer looking to repurpose for solar backup or certified recycling.",
        },
    )
    assert report_res.status_code == 200
    report_data = report_res.json()
    assert report_data["status"] == "success"
    assert "report_id" in report_data
    assert "disclaimer" in report_data
    assert len(report_data["next_steps"]) >= 3

    # 3. Customer views "My Discarded Batteries"
    my_discarded_res = client.get("/api/customer/discarded-batteries", headers=cust_headers)
    assert my_discarded_res.status_code == 200
    disc_data = my_discarded_res.json()
    assert disc_data["count"] >= 1
    found_item = next((b for b in disc_data["discarded_batteries"] if b["battery_id"] == battery_id), None)
    assert found_item is not None
    assert found_item["reporting_reason"] == "Reached the end of its useful EV service"
    assert found_item["sharing_status"] == "PENDING_ASSESSMENT"

    # 4. Consumer discovers eligible discarded batteries (without personal PII)
    # Login as consumer (Second-Life Consumer)
    consumer_token = _login(client, "consumer@evolve.ai")
    consumer_headers = {"Authorization": f"Bearer {consumer_token}"}

    shared_res = client.get("/api/recycling/batteries?chemistry=LFP", headers=consumer_headers)
    assert shared_res.status_code == 200
    shared_data = shared_res.json()
    assert shared_data["count"] >= 1
    discovered_bat = next((b for b in shared_data["batteries"] if b["battery_id"] == battery_id), None)
    assert discovered_bat is not None
    # Verify strict privacy constraints: NO customer name, email, phone, or license plate
    assert "owner_name" not in discovered_bat
    assert "owner_email" not in discovered_bat
    assert "owner_phone" not in discovered_bat
    assert "license_plate" not in discovered_bat
    assert "registration_number" not in discovered_bat
    assert discovered_bat["chemistry"] == "LFP"
    assert "safety_disclaimer" in discovered_bat
    assert discovered_bat["approximate_area"] == "Bengaluru, Karnataka"

    # 5. Consumer views single battery detail page with Sections A-E
    detail_res = client.get(f"/api/recycling/batteries/{battery_id}", headers=consumer_headers)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["battery"]["battery_id"] == battery_id
    assert "disposal_info" in detail_data
    assert detail_data["disposal_info"]["reporting_reason"] == "Reached the end of its useful EV service"
    assert len(detail_data["timeline"]) >= 1

    # 6. Consumer submits non-binding inquiry
    enquire_res = client.post(
        f"/api/recycling/batteries/{battery_id}/enquire",
        headers=consumer_headers,
        json={
            "enquiry_purpose": "Second-life stationary storage project",
            "intended_application": "Solar Energy Storage",
            "message": "Interested in testing pack modules for a 15 kWh rooftop microgrid installation.",
        },
    )
    assert enquire_res.status_code == 200
    enq_data = enquire_res.json()
    assert enq_data["status"] == "success"
    assert "enquiry_id" in enq_data

    # 7. Customer sees enquiry activity logged
    cust_enquiries_res = client.get(f"/api/customer/batteries/{battery_id}/enquiries", headers=cust_headers)
    assert cust_enquiries_res.status_code == 200
    assert cust_enquiries_res.json()["enquiries_count"] >= 1
    # Customer should not see full raw email or unmasked PII
    cust_enq = cust_enquiries_res.json()["enquiries"][0]
    assert cust_enq["enquiry_purpose"] == "Second-life stationary storage project"

    # 8. Consumer views "My Enquiries"
    my_enq_res = client.get("/api/recycling/my-enquiries", headers=consumer_headers)
    assert my_enq_res.status_code == 200
    my_enqs = my_enq_res.json()
    assert my_enqs["count"] >= 1
    assert any(e["battery_id"] == battery_id for e in my_enqs["enquiries"])

    # 9. Educational 9-Component Parts & Materials Guide
    parts_res = client.get("/api/recycling/parts-guide?chemistry=LFP", headers=consumer_headers)
    assert parts_res.status_code == 200
    guide_data = parts_res.json()
    assert guide_data["component_count"] == 9
    assert len(guide_data["components"]) == 9
    component_ids = [c["id"] for c in guide_data["components"]]
    expected_ids = ["cells", "bms", "enclosure", "cooling", "busbars", "contactors", "tim", "sense_harness", "insulation"]
    for cid in expected_ids:
        assert cid in component_ids
    assert "safety_advisory" in guide_data
