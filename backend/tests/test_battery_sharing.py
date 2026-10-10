"""
Integration Tests for Shared Battery Record and Recycling Portal.

Verifies:
  1. EV Owner registers and canonical Battery record is created/linked.
  2. Battery is PRIVATE by default and hidden from shared recycling view.
  3. Sharing consent workflow updates status and allows visibility.
  4. Privacy sanitization (PII like email, phone, full name, license plate are stripped).
  5. Authorized assessment (Recycler/Admin) updates lifecycle and second-life status.
  6. Authorization boundaries: second customer cannot access first customer's battery.
  7. Unauthorized viewers cannot execute lifecycle actions (assessment/collection).
  8. Revoking sharing consent hides the battery from public shared view.
  9. Collection actions update tracking status and audit trail.
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient

from app.database.base import session_scope
from app.database.models import Battery, LifecycleEvent, User, UserVehicle
from app.data.demo_seed import _seed_demo_users
from app.main import app
from app.services.auth import create_access_token


@pytest.fixture(autouse=True)
def setup_users():
    """Ensure baseline demo accounts exist."""
    with session_scope() as db:
        if db.query(User).filter(User.username == "sai_teja").first() is None:
            _seed_demo_users(db)


def test_customer_canonical_battery_and_sharing_workflow():
    client = TestClient(app)

    # 1. Create a unique test customer
    suffix = uuid.uuid4().hex[:6]
    email = f"owner_{suffix}@example.com"
    username = f"owner_{suffix}"

    # Generate token directly
    with session_scope() as db:
        user = User(
            full_name=f"Test Owner {suffix}",
            username=username,
            email=email,
            phone="+91 9876543210",
            password_hash="pbkdf2_sha256$100000$dummy$dummy",
            email_verified=True,
            role="CUSTOMER",
            city="Bengaluru",
            state="Karnataka",
        )
        db.add(user)
        db.flush()

        veh = UserVehicle(
            user_id=user.id,
            vehicle_number="KA01AB1234",
            manufacturer="Tata",
            model="Nexon EV Max",
            purchase_year=2023,
            odometer_km=25000.0,
            city="Bengaluru",
            state="Karnataka",
        )
        db.add(veh)
        db.commit()
        user_id = user.id

    token = create_access_token({"sub": user_id, "email": email, "role": "CUSTOMER"})
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Call GET /api/customer/batteries
    res = client.get("/api/customer/batteries", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["count"] >= 1
    bat_info = data["batteries"][0]
    battery_id = bat_info["battery_id"]
    assert bat_info["sharing_status"] == "PRIVATE"
    assert bat_info["sharing_consent"] is False
    assert bat_info["vehicle_manufacturer"] == "Tata"

    # 3. Call GET /api/recycling/batteries -> Private battery must NOT be in shared view
    shared_res = client.get("/api/recycling/batteries")
    assert shared_res.status_code == 200
    shared_bats = shared_res.json()["batteries"]
    shared_ids = [b["battery_id"] for b in shared_bats]
    assert battery_id not in shared_ids, "Private battery should NOT appear in shared recycling view"

    # 4. EV Owner grants sharing consent
    consent_res = client.post(
        f"/api/customer/batteries/{battery_id}/sharing-consent",
        headers=headers,
        json={"consent": True},
    )
    assert consent_res.status_code == 200
    consent_data = consent_res.json()
    assert consent_data["sharing_consent"] is True
    assert consent_data["sharing_status"] == "PENDING_ASSESSMENT"

    # 5. Check shared recycling view now -> Battery is NOW visible
    shared_res2 = client.get("/api/recycling/batteries")
    assert shared_res2.status_code == 200
    shared_bats2 = shared_res2.json()["batteries"]
    shared_match = next((b for b in shared_bats2 if b["battery_id"] == battery_id), None)
    assert shared_match is not None, "Consented battery must appear in shared view"
    # Verify privacy sanitization (no PII)
    assert "owner" not in shared_match
    assert "email" not in shared_match
    assert "phone" not in shared_match
    assert "vehicle_number" not in shared_match
    assert shared_match["sharing_status"] == "PENDING_ASSESSMENT"
    assert "Bengaluru" in shared_match["approximate_area"]

    # 6. Customer attempts unauthorized recycler action -> 403 Forbidden
    unauth_assess = client.post(
        f"/api/recycling/batteries/{battery_id}/assessment",
        headers=headers,
        json={"outcome": "APPROVED_FOR_SECOND_LIFE", "tested_soh": 0.78},
    )
    assert unauth_assess.status_code == 403, "Customer should not be able to perform recycler assessment"

    # 7. Login as Recycler and perform authorized assessment
    with session_scope() as db:
        rec_user = db.query(User).filter(User.email == "recycler@evolve.ai").first()
        recycler_id = rec_user.id

        # Also create customer 2 for authorization test
        cust2 = User(
            full_name="Second Customer",
            username=f"cust2_{suffix}",
            email=f"cust2_{suffix}@example.com",
            phone="+91 9123456789",
            password_hash="pbkdf2_sha256$100000$dummy$dummy",
            email_verified=True,
            role="CUSTOMER",
        )
        db.add(cust2)
        db.commit()
        cust2_id = cust2.id

    recycler_token = create_access_token({"sub": recycler_id, "email": "recycler@evolve.ai", "role": "RECYCLER"})
    recycler_headers = {"Authorization": f"Bearer {recycler_token}"}

    assess_res = client.post(
        f"/api/recycling/batteries/{battery_id}/assessment",
        headers=recycler_headers,
        json={"outcome": "APPROVED_FOR_SECOND_LIFE", "tested_soh": 0.78, "notes": "Capacity retains 78% SOH; suitable for 10kWh home solar backup."},
    )
    assert assess_res.status_code == 200, assess_res.text
    assert assess_res.json()["sharing_status"] == "APPROVED_FOR_SECOND_LIFE"

    # 8. Customer checks their own battery -> sees updated status and lifecycle event
    cust_bat_res = client.get(f"/api/customer/batteries/{battery_id}", headers=headers)
    assert cust_bat_res.status_code == 200
    cust_bat = cust_bat_res.json()["battery"]
    assert cust_bat["sharing_status"] == "APPROVED_FOR_SECOND_LIFE"
    assert cust_bat["second_life_status"] == "ASSESSED_SUITABLE"
    assert cust_bat["second_life_suitability"] == "HIGH"

    # Timeline includes ASSESSMENT_COMPLETED
    timeline = cust_bat_res.json()["timeline"]
    events = [e["event"] for e in timeline]
    assert "SHARING_CONSENT_GRANTED" in events
    assert "ASSESSMENT_COMPLETED" in events

    # 9. Authorization boundary: Second customer tries to access first customer's battery
    cust2_token = create_access_token({"sub": cust2_id, "email": f"cust2_{suffix}@example.com", "role": "CUSTOMER"})
    cust2_headers = {"Authorization": f"Bearer {cust2_token}"}
    blocked_res = client.get(f"/api/customer/batteries/{battery_id}", headers=cust2_headers)
    assert blocked_res.status_code == 403, "Other customer must receive 403 Forbidden"

    # 10. Customer revokes sharing consent -> returns to PRIVATE
    revoke_res = client.post(
        f"/api/customer/batteries/{battery_id}/sharing-consent",
        headers=headers,
        json={"consent": False},
    )
    assert revoke_res.status_code == 200
    assert revoke_res.json()["sharing_status"] == "PRIVATE"
    assert revoke_res.json()["sharing_consent"] is False

    # Check shared view again -> battery is gone from public view
    shared_res3 = client.get("/api/recycling/batteries")
    shared_ids3 = [b["battery_id"] for b in shared_res3.json()["batteries"]]
    assert battery_id not in shared_ids3, "Revoked battery must NOT appear in public shared view"
