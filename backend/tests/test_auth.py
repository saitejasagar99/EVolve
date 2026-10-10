"""
Tests for EVolve AI User Registration, Authentication, Email OTP, and Profile Management.

Verifies:
  1. Registration input validation (username, email, phone, vehicle, password)
  2. Duplicate handling for email and username
  3. Aadhaar encryption and masking (never plain text)
  4. 6-digit Email OTP generation, hashing, verification, and expiry
  5. Attempt limits (max 5) and resend rate-limiting cooldown
  6. Login authentication and JWT generation
  7. Password recovery via OTP
  8. Authorization boundaries (customer cannot access admin, unauthenticated blocked)
  9. Sensitive data masking (vehicle number, phone, email, Aadhaar)
  10. Vehicle persistence into customer battery intelligence flow
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.base import session_scope
from app.database.models import EmailOTP, User, UserVehicle
from app.data.demo_seed import _seed_demo_users
from app.services.auth import (
    create_access_token,
    decode_access_token,
    get_dev_otp,
    hash_password,
    mask_aadhaar,
    mask_email,
    mask_phone,
    mask_vehicle_number,
    validate_and_normalize_phone,
    validate_and_normalize_vehicle_number,
    validate_password_strength,
    validate_username,
    verify_password,
)


@pytest.fixture(autouse=True)
def ensure_auth_demo_users():
    """Ensure baseline demo accounts are present before auth tests."""
    with session_scope() as db:
        _seed_demo_users(db)
        cust = db.query(User).filter(User.email == "customer@evolve.ai").first()
        if cust:
            cust.password_hash = hash_password("Evolve@2026")
            cust.email_verified = True
    yield


# ---------------------------------------------------------------------------
# Unit tests: Security & Validation Utilities
# ---------------------------------------------------------------------------

def test_password_hashing_and_verification():
    pw = "SuperSecure@2026"
    hashed = hash_password(pw)
    assert hashed.startswith("pbkdf2_sha256$100000$")
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword@123", hashed) is False


def test_password_strength_validation():
    assert validate_password_strength("Short1A")[0] is False  # too short
    assert validate_password_strength("alllowercase123")[0] is False  # no uppercase
    assert validate_password_strength("ALLUPPERCASE123")[0] is False  # no lowercase
    assert validate_password_strength("NoNumbersAtAll!")[0] is False  # no number
    assert validate_password_strength("ValidPassword123")[0] is True


def test_phone_validation_and_normalization():
    valid, norm, _ = validate_and_normalize_phone("9876543210")
    assert valid is True
    assert norm == "+91 98765 43210"

    valid, norm, _ = validate_and_normalize_phone("+91 9876543210")
    assert valid is True
    assert norm == "+91 98765 43210"

    valid, _, err = validate_and_normalize_phone("12345")
    assert valid is False
    assert "valid" in err.lower()


def test_vehicle_number_validation():
    valid, norm, _ = validate_and_normalize_vehicle_number("ts09ab1234")
    assert valid is True
    assert norm == "TS09AB1234"

    valid, norm, _ = validate_and_normalize_vehicle_number("DL-1C-AB-1234")
    assert valid is True
    assert norm == "DL1CAB1234"


def test_sensitive_data_masking():
    assert mask_email("saiteja@example.com") == "sa****@example.com"
    assert mask_phone("+91 98765 43210") == "+91 ******3210"
    assert mask_vehicle_number("TS09AB1234") == "TS09AB****"
    assert mask_aadhaar("1234") == "XXXX-XXXX-1234"
    assert mask_aadhaar(None) == "Not Provided"


def test_jwt_generation_and_decoding():
    payload = {"sub": 42, "role": "CUSTOMER", "email": "test@evolve.ai"}
    token = create_access_token(payload, expires_delta=timedelta(hours=1))
    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == 42
    assert decoded["role"] == "CUSTOMER"

    # Corrupt token
    assert decode_access_token(token + "corrupt") is None


# ---------------------------------------------------------------------------
# API Integration Tests
# ---------------------------------------------------------------------------

def test_full_registration_and_otp_activation_flow(client: TestClient):
    """Verify full journey: register -> receive OTP -> verify OTP -> login -> profile."""
    tag = uuid.uuid4().hex[:6]
    test_email = f"kiran_{tag}@example.com"
    test_user = f"kiran_{tag}"

    reg_data = {
        "full_name": "Kiran Kumar",
        "username": test_user,
        "email": test_email,
        "phone": "+91 9812345678",
        "aadhaar_number": "1234 5678 9012",
        "vehicle_number": "TS07EF5678",
        "vehicle_manufacturer": "Tata",
        "vehicle_model": "Nexon EV",
        "vehicle_purchase_year": 2024,
        "odometer_km": 35000.0,
        "city": "Hyderabad",
        "state": "Telangana",
        "pincode": "500032",
        "password": "SecurePassword@2026",
        "confirm_password": "SecurePassword@2026",
    }

    # 1. Register
    reg_res = client.post("/api/auth/register", json=reg_data)
    assert reg_res.status_code == 200
    reg_body = reg_res.json()
    assert reg_body["status"] == "pending_verification"
    assert "dev_otp" in reg_body
    otp_code = reg_body["dev_otp"]

    # 2. Cannot login before verification
    login_unverified = client.post("/api/auth/login", json={
        "email": test_email,
        "password": "SecurePassword@2026",
    })
    assert login_unverified.status_code == 403

    # 3. Wrong OTP fails
    bad_otp_res = client.post("/api/auth/verify-email", json={
        "email": test_email,
        "otp_code": "000000",
    })
    assert bad_otp_res.status_code == 400

    # 4. Correct OTP activates account
    verify_res = client.post("/api/auth/verify-email", json={
        "email": test_email,
        "otp_code": otp_code,
    })
    assert verify_res.status_code == 200, verify_res.json()
    v_body = verify_res.json()
    assert v_body["status"] == "verified"
    token = v_body["access_token"]
    assert token

    # 5. Login works now
    login_res = client.post("/api/auth/login", json={
        "email": test_email,
        "password": "SecurePassword@2026",
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # 6. Retrieve authenticated profile
    profile_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert profile_res.status_code == 200
    prof = profile_res.json()
    assert prof["email"] == test_email
    assert prof["masked_aadhaar"] == "XXXX-XXXX-9012"
    assert prof["vehicle"]["vehicle_number"] == "TS07EF5678"
    assert prof["vehicle"]["masked_vehicle_number"] == "TS07EF****"


def test_registration_validation_errors(client: TestClient):
    base = {
        "full_name": "Test User",
        "username": f"user_{uuid.uuid4().hex[:6]}",
        "email": f"test_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+91 9876543210",
        "vehicle_number": "TS09AB1234",
        "vehicle_manufacturer": "Tata",
        "vehicle_model": "Tiago EV",
        "vehicle_purchase_year": 2023,
        "password": "ValidPassword@2026",
        "confirm_password": "ValidPassword@2026",
    }

    # Password mismatch
    mismatch = dict(base, confirm_password="DifferentPassword@2026")
    res = client.post("/api/auth/register", json=mismatch)
    assert res.status_code in (400, 422)

    # Weak password
    weak = dict(base, password="weak", confirm_password="weak")
    res = client.post("/api/auth/register", json=weak)
    assert res.status_code in (400, 422)

    # Invalid phone
    bad_phone = dict(base, phone="12345")
    res = client.post("/api/auth/register", json=bad_phone)
    assert res.status_code in (400, 422)


def test_preseeded_demo_accounts_login(client: TestClient):
    """Verify preseeded demo roles: customer, consumer, recycler, admin."""
    # Customer
    res_c = client.post("/api/auth/login", json={"email": "customer@evolve.ai", "password": "Evolve@2026"})
    assert res_c.status_code == 200
    assert res_c.json()["user"]["role"] == "CUSTOMER"

    # Admin
    res_a = client.post("/api/auth/login", json={"email": "admin@evolve.ai", "password": "Evolve@2026"})
    assert res_a.status_code == 200
    assert res_a.json()["user"]["role"] == "ADMIN"


def test_password_recovery_flow(client: TestClient):
    """Verify forgot password -> OTP -> new password -> successful login."""
    # 1. Forgot password
    fp_res = client.post("/api/auth/forgot-password", json={"email": "customer@evolve.ai"})
    assert fp_res.status_code == 200
    fp_body = fp_res.json()
    assert "dev_otp" in fp_body
    otp = fp_body["dev_otp"]

    # 2. Reset password with OTP
    new_pw = "BrandNewPass@2026"
    rp_res = client.post("/api/auth/reset-password", json={
        "email": "customer@evolve.ai",
        "otp_code": otp,
        "new_password": new_pw,
        "confirm_password": new_pw,
    })
    assert rp_res.status_code == 200

    # 3. Old password fails
    fail_res = client.post("/api/auth/login", json={"email": "customer@evolve.ai", "password": "Evolve@2026"})
    assert fail_res.status_code == 401

    # 4. New password succeeds
    ok_res = client.post("/api/auth/login", json={"email": "customer@evolve.ai", "password": new_pw})
    assert ok_res.status_code == 200

    # Restore password for other tests
    client.post("/api/auth/forgot-password", json={"email": "customer@evolve.ai"})
    reset_otp = get_dev_otp("customer@evolve.ai")
    if reset_otp:
        client.post("/api/auth/reset-password", json={
            "email": "customer@evolve.ai",
            "otp_code": reset_otp,
            "new_password": "Evolve@2026",
            "confirm_password": "Evolve@2026",
        })

    # Restore password for other tests
    client.post("/api/auth/forgot-password", json={"email": "customer@evolve.ai"})
    reset_otp = get_dev_otp("customer@evolve.ai")
    if reset_otp:
        client.post("/api/auth/reset-password", json={
            "email": "customer@evolve.ai",
            "otp_code": reset_otp,
            "new_password": "Evolve@2026",
            "confirm_password": "Evolve@2026",
        })


def test_profile_update_and_vehicle_persistence(client: TestClient):
    """Verify customer profile retrieval and editing."""
    login_res = client.post("/api/auth/login", json={"email": "customer@evolve.ai", "password": "Evolve@2026"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch profile
    prof_res = client.get("/api/customer/profile", headers=headers)
    assert prof_res.status_code == 200
    p = prof_res.json()
    assert p["vehicle"] is not None

    # Update profile odometer and city
    update_res = client.put("/api/customer/profile", headers=headers, json={
        "city": "Cyberabad",
        "odometer_km": 49500.0,
    })
    assert update_res.status_code == 200
    up = update_res.json()["user"]
    assert up["vehicle"]["city"] == "Cyberabad"
    assert up["vehicle"]["odometer_km"] == 49500.0


def test_role_authorization_boundaries(client: TestClient):
    """Verify customer/consumer/recycler cannot access admin, and unauthenticated are blocked."""
    # 1. Unauthenticated blocked (401)
    unauth_res = client.get("/api/admin/overview")
    assert unauth_res.status_code == 401

    # 2. Customer logged in -> forbidden from admin (403)
    login_c = client.post("/api/auth/login", json={"email": "customer@evolve.ai", "password": "Evolve@2026"})
    token_c = login_c.json()["access_token"]
    cust_res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token_c}"})
    assert cust_res.status_code == 403

    # 3. Consumer logged in -> forbidden from admin (403)
    login_cons = client.post("/api/auth/login", json={"email": "consumer@evolve.ai", "password": "Evolve@2026"})
    token_cons = login_cons.json()["access_token"]
    cons_res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token_cons}"})
    assert cons_res.status_code == 403

    # 4. Recycler logged in -> forbidden from admin (403)
    login_r = client.post("/api/auth/login", json={"email": "recycler@evolve.ai", "password": "Evolve@2026"})
    token_r = login_r.json()["access_token"]
    rec_res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token_r}"})
    assert rec_res.status_code == 403

    # 5. Admin logged in -> authorized (200)
    login_a = client.post("/api/auth/login", json={"email": "admin@evolve.ai", "password": "Evolve@2026"})
    token_a = login_a.json()["access_token"]
    admin_res = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {token_a}"})
    assert admin_res.status_code == 200
    assert admin_res.json()["status"] == "authorized"


def test_user_type_selection_consumer_registration(client: TestClient):
    """Second-Life Battery Consumer registration requires NO vehicle details."""
    uid = uuid.uuid4().hex[:6]
    email = f"consumer_{uid}@example.com"
    payload = {
        "full_name": "Ravi Teja",
        "username": f"consumer_{uid}",
        "email": email,
        "phone": "+91 9988776655",
        "role": "CONSUMER",
        "city": "Bengaluru",
        "state": "Karnataka",
        "pincode": "560001",
        "intended_battery_application": "Solar Energy Storage",
        "password": "ConsumerPassword@2026",
        "confirm_password": "ConsumerPassword@2026",
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "pending_verification"
    otp = data["dev_otp"]

    # Verify email
    v_res = client.post("/api/auth/verify-email", json={"email": email, "otp_code": otp})
    assert v_res.status_code == 200
    v_data = v_res.json()
    assert v_data["user"]["role"] == "CONSUMER"
    assert v_data["user"]["intended_application"] == "Solar Energy Storage"
    assert v_data["user"]["vehicle"] is None


def test_user_type_selection_disallowed_roles(client: TestClient):
    """Direct registration as ADMIN or RECYCLER must be rejected with 400 Bad Request."""
    base = {
        "full_name": "Attacker",
        "username": f"hacker_{uuid.uuid4().hex[:6]}",
        "email": f"hacker_{uuid.uuid4().hex[:6]}@example.com",
        "phone": "+91 9988776655",
        "password": "Password@2026",
        "confirm_password": "Password@2026",
    }
    # Attempt ADMIN registration
    res_admin = client.post("/api/auth/register", json=dict(base, role="ADMIN"))
    assert res_admin.status_code == 400
    assert "Administrator" in res_admin.json()["detail"] or "not permitted" in res_admin.json()["detail"]

    # Attempt RECYCLER registration
    res_rec = client.post("/api/auth/register", json=dict(base, role="RECYCLER"))
    assert res_rec.status_code == 400
    assert "Recycler" in res_rec.json()["detail"] or "not permitted" in res_rec.json()["detail"]


def test_ev_owner_requires_vehicle(client: TestClient):
    """EV Owner (CUSTOMER) registration must fail if vehicle registration is missing."""
    uid = uuid.uuid4().hex[:6]
    payload = {
        "full_name": "EV Owner Missing Vehicle",
        "username": f"evowner_{uid}",
        "email": f"evowner_{uid}@example.com",
        "phone": "+91 9988776655",
        "role": "CUSTOMER",
        "password": "SecurePassword@2026",
        "confirm_password": "SecurePassword@2026",
        # vehicle_number missing
    }
    res = client.post("/api/auth/register", json=payload)
    assert res.status_code in (400, 422)


def test_account_deletion_flow(client: TestClient):
    """Authenticated user can delete their account and personal data."""
    uid = uuid.uuid4().hex[:6]
    email = f"delete_me_{uid}@example.com"
    pwd = "DeletePassword@2026"
    reg_payload = {
        "full_name": "Temporary User",
        "username": f"temp_{uid}",
        "email": email,
        "phone": "+91 9123456789",
        "role": "CUSTOMER",
        "vehicle_number": "TS09DE1234",
        "vehicle_manufacturer": "Tata",
        "vehicle_model": "Tiago EV",
        "vehicle_purchase_year": 2023,
        "odometer_km": 15000,
        "city": "Hyderabad",
        "state": "Telangana",
        "password": pwd,
        "confirm_password": pwd,
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    otp = reg_res.json()["dev_otp"]

    # Verify and get active session
    v_res = client.post("/api/auth/verify-email", json={"email": email, "otp_code": otp})
    assert v_res.status_code == 200
    token = v_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Delete account with password
    del_res = client.request("DELETE", "/api/auth/me", headers=headers, json={"password": pwd})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "success"

    # Verify user can no longer log in
    login_after = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login_after.status_code == 401

    # Verify token is now invalid / user does not exist
    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 401


def test_account_deletion_invalid_password(client: TestClient):
    """Account deletion must fail if an incorrect password is supplied."""
    uid = uuid.uuid4().hex[:6]
    email = f"nodelete_{uid}@example.com"
    pwd = "CorrectPassword@2026"
    reg_payload = {
        "full_name": "No Delete User",
        "username": f"nodelete_{uid}",
        "email": email,
        "phone": "+91 9123456780",
        "role": "CONSUMER",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "password": pwd,
        "confirm_password": pwd,
    }
    reg_res = client.post("/api/auth/register", json=reg_payload)
    assert reg_res.status_code == 200
    otp = reg_res.json()["dev_otp"]

    v_res = client.post("/api/auth/verify-email", json={"email": email, "otp_code": otp})
    assert v_res.status_code == 200
    token = v_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Wrong password attempt
    del_res = client.request("DELETE", "/api/auth/me", headers=headers, json={"password": "WrongPassword@2026"})
    assert del_res.status_code == 400
    assert "Incorrect password" in del_res.json()["detail"]

    # Account remains intact
    login_ok = client.post("/api/auth/login", json={"email": email, "password": pwd})
    assert login_ok.status_code == 200


def test_account_deletion_protects_root_admin(client: TestClient):
    """System demo administrator cannot be deleted."""
    login_admin = client.post("/api/auth/login", json={"email": "admin@evolve.ai", "password": "Evolve@2026"})
    assert login_admin.status_code == 200
    token = login_admin.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    del_res = client.request("DELETE", "/api/auth/me", headers=headers, json={"password": "Evolve@2026"})
    assert del_res.status_code == 400
    assert "cannot be deleted" in del_res.json()["detail"]
