"""
Authentication, Registration, Email OTP, and User Profile API Routes for EVolve AI.

Endpoints:
  POST /api/auth/register          -> Submit registration, create pending user & dispatch OTP
  POST /api/auth/verify-email      -> Verify 6-digit OTP & activate account
  POST /api/auth/login             -> Authenticate user with password & issue JWT
  POST /api/auth/resend-otp        -> Resend verification OTP with 45s cooldown
  POST /api/auth/forgot-password   -> Request password reset OTP
  POST /api/auth/reset-password    -> Reset password using OTP
  GET  /api/auth/me                -> Get currently authenticated user safe profile
  GET  /api/customer/profile       -> Get customer profile and registered vehicle
  PUT  /api/customer/profile       -> Update customer profile & vehicle details
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import config
from ..database.base import get_db
from ..database.models import CustomerAssessment, EmailOTP, User, UserVehicle
from ..schemas.models import (
    DeleteAccountRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ResendOtpRequest,
    UserLoginRequest,
    UserProfileUpdateRequest,
    UserRegisterRequest,
    UserSafeResponse,
    VerifyEmailRequest,
)
from ..services.auth import (
    check_otp_resend_cooldown,
    create_access_token,
    create_or_update_otp,
    get_current_user,
    get_dev_otp,
    hash_password,
    mask_aadhaar,
    mask_email,
    mask_phone,
    mask_vehicle_number,
    send_email_otp,
    validate_and_normalize_phone,
    validate_and_normalize_vehicle_number,
    validate_and_tokenize_aadhaar,
    validate_email_address,
    validate_password_strength,
    validate_username,
    verify_email_otp,
    verify_password,
    require_role,
)

logger = logging.getLogger("evolve.auth_routes")

auth_router = APIRouter(prefix="/api/auth", tags=["Authentication"])
profile_router = APIRouter(prefix="/api/customer", tags=["Customer Profile"])
admin_router = APIRouter(prefix="/api/admin", tags=["Admin Operations"])


def _build_safe_user_dict(user: User, db: Session) -> dict[str, Any]:
    """Helper to assemble a secure, privacy-masked profile payload for frontend consumption."""
    veh = db.query(UserVehicle).filter(UserVehicle.user_id == user.id).first()
    veh_dict = None
    if veh:
        veh_dict = {
            "id": veh.id,
            "vehicle_number": veh.vehicle_number,
            "masked_vehicle_number": mask_vehicle_number(veh.vehicle_number),
            "manufacturer": veh.manufacturer,
            "model": veh.model,
            "vehicle_manufacturer": veh.manufacturer,
            "vehicle_model": veh.model,
            "purchase_year": veh.purchase_year,
            "odometer_km": veh.odometer_km,
            "city": veh.city,
            "state": veh.state,
            "pincode": veh.pincode,
        }

    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "masked_email": mask_email(user.email),
        "phone": user.phone,
        "masked_phone": mask_phone(user.phone),
        "masked_aadhaar": mask_aadhaar(user.aadhaar_last4),
        "role": user.role,
        "email_verified": user.email_verified,
        "created_at": user.created_at.isoformat() if user.created_at else "",
        "city": getattr(user, "city", None) or (veh.city if veh else None),
        "state": getattr(user, "state", None) or (veh.state if veh else None),
        "pincode": getattr(user, "pincode", None) or (veh.pincode if veh else None),
        "intended_application": getattr(user, "intended_application", None),
        "intended_battery_application": getattr(user, "intended_application", None),
        "vehicle": veh_dict,
    }


# ---------------------------------------------------------------------------
# Registration & Verification Endpoints
# ---------------------------------------------------------------------------

@auth_router.post("/register")
def register_user(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Register a new user account (EV Owner or Second-Life Battery Consumer).
    Validates input fields, stores pending user & vehicle records, and dispatches 6-digit email OTP.
    """
    # 0. Validate Role Selection
    raw_role = (payload.role or "CUSTOMER").strip().upper()
    if raw_role in ("ADMIN", "RECYCLER"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration as Administrator or Recycler is not permitted through public registration. Contact system administrator.",
        )
    if raw_role not in ("CUSTOMER", "CONSUMER"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user type. Allowed roles are 'CUSTOMER' (EV Owner) and 'CONSUMER' (Second-Life Consumer).",
        )

    # 1. Validate Username
    valid_u, u_err = validate_username(payload.username)
    if not valid_u:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=u_err)

    # Check Username Uniqueness
    clean_username = payload.username.strip().lower()
    existing_u = db.query(User).filter(User.username == clean_username).first()
    if existing_u and existing_u.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is already taken. Please choose another username.",
        )

    # 2. Validate Email
    valid_e, e_err = validate_email_address(payload.email)
    if not valid_e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=e_err)

    clean_email = payload.email.strip().lower()
    existing_e = db.query(User).filter(User.email == clean_email).first()
    if existing_e and existing_e.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account is already registered with this email address. Please sign in.",
        )

    # 3. Validate Phone Number
    valid_p, norm_phone, p_err = validate_and_normalize_phone(payload.phone)
    if not valid_p:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=p_err)

    # 4. Validate Vehicle Registration (Only required for EV Owner / CUSTOMER)
    norm_veh_no = None
    if raw_role == "CUSTOMER":
        if not payload.vehicle_number or not payload.vehicle_number.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle registration number is required for EV Owners.",
            )
        valid_v, norm_veh_no, v_err = validate_and_normalize_vehicle_number(payload.vehicle_number)
        if not valid_v:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=v_err)
        if not payload.vehicle_manufacturer or not payload.vehicle_manufacturer.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle manufacturer is required for EV Owners.",
            )
        if not payload.vehicle_model or not payload.vehicle_model.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Vehicle model is required for EV Owners.",
            )
        if not payload.vehicle_purchase_year:
            payload.vehicle_purchase_year = 2024
    else:
        # CONSUMER: vehicle information is optional
        if payload.vehicle_number and payload.vehicle_number.strip():
            valid_v, norm_veh_no, _ = validate_and_normalize_vehicle_number(payload.vehicle_number)

    # 5. Validate Password & Confirmation
    if payload.password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match.")

    valid_pw, pw_err = validate_password_strength(payload.password)
    if not valid_pw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pw_err)

    # 6. Validate Aadhaar (if provided)
    valid_a, enc_aadhaar, last4, a_err = validate_and_tokenize_aadhaar(payload.aadhaar_number)
    if not valid_a:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=a_err)

    # 7. Create or update pending user
    user = existing_e or existing_u
    if not user:
        user = User(
            full_name=payload.full_name.strip(),
            username=clean_username,
            email=clean_email,
            phone=norm_phone,
            aadhaar_encrypted=enc_aadhaar,
            aadhaar_last4=last4,
            password_hash=hash_password(payload.password),
            email_verified=False,
            role=raw_role,
            city=payload.city.strip() if payload.city else None,
            state=payload.state.strip() if payload.state else None,
            pincode=payload.pincode.strip() if payload.pincode else None,
            intended_application=payload.intended_battery_application.strip() if payload.intended_battery_application else None,
        )
        db.add(user)
        db.flush()
    else:
        # Re-registration of unverified account: update credentials and details
        user.full_name = payload.full_name.strip()
        user.username = clean_username
        user.phone = norm_phone
        user.aadhaar_encrypted = enc_aadhaar
        user.aadhaar_last4 = last4
        user.password_hash = hash_password(payload.password)
        user.role = raw_role
        user.city = payload.city.strip() if payload.city else None
        user.state = payload.state.strip() if payload.state else None
        user.pincode = payload.pincode.strip() if payload.pincode else None
        user.intended_application = payload.intended_battery_application.strip() if payload.intended_battery_application else None
        db.flush()

    # 8. Create or update registered vehicle (Only for EV Owners)
    if raw_role == "CUSTOMER" and norm_veh_no:
        veh = db.query(UserVehicle).filter(UserVehicle.user_id == user.id).first()
        if not veh:
            veh = UserVehicle(
                user_id=user.id,
                vehicle_number=norm_veh_no,
                manufacturer=payload.vehicle_manufacturer.strip() if payload.vehicle_manufacturer else "Tata",
                model=payload.vehicle_model.strip() if payload.vehicle_model else "Nexon EV",
                purchase_year=payload.vehicle_purchase_year or 2024,
                odometer_km=payload.odometer_km or 0.0,
                city=payload.city.strip() if payload.city else "Hyderabad",
                state=payload.state.strip() if payload.state else "Telangana",
                pincode=payload.pincode.strip() if payload.pincode else None,
            )
            db.add(veh)
        else:
            veh.vehicle_number = norm_veh_no
            if payload.vehicle_manufacturer:
                veh.manufacturer = payload.vehicle_manufacturer.strip()
            if payload.vehicle_model:
                veh.model = payload.vehicle_model.strip()
            if payload.vehicle_purchase_year:
                veh.purchase_year = payload.vehicle_purchase_year
            if payload.odometer_km is not None:
                veh.odometer_km = payload.odometer_km
            if payload.city:
                veh.city = payload.city.strip()
            if payload.state:
                veh.state = payload.state.strip()
            if payload.pincode:
                veh.pincode = payload.pincode.strip()

    db.commit()

    # 9. Generate and Dispatch OTP
    otp_code, _ = create_or_update_otp(db, clean_email, purpose="REGISTRATION")
    delivery = send_email_otp(clean_email, otp_code, purpose="Registration Verification")

    resp: dict[str, Any] = {
        "status": "pending_verification",
        "message": (
            "Registration submitted! We've sent a 6-digit verification code to your Gmail inbox."
            if delivery.success
            else "Registration submitted. (Note: Gmail SMTP credentials are not yet configured in backend/.env)"
        ),
        "email": clean_email,
        "masked_email": mask_email(clean_email),
        "email_delivered": delivery.success,
        "delivery_status": delivery.status_code,
        "delivery_message": delivery.message,
    }

    if config.EMAIL_OTP_MODE == "test":
        dev_code = get_dev_otp(clean_email)
        if dev_code:
            resp["dev_otp"] = dev_code

    return resp


@auth_router.post("/verify-email")
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Verify 6-digit email OTP and activate customer account.
    Issues JWT token upon successful verification.
    """
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found. Please register first.",
        )

    success, msg = verify_email_otp(db, clean_email, payload.otp_code, purpose="REGISTRATION")
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    # Activate user account
    user.email_verified = True
    db.commit()

    token = create_access_token({
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    })

    return {
        "status": "verified",
        "message": "Email verified successfully! Welcome to EVolve AI.",
        "access_token": token,
        "token_type": "bearer",
        "user": _build_safe_user_dict(user, db),
    }


@auth_router.post("/resend-otp")
def resend_verification_otp(
    payload: ResendOtpRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Resend email verification OTP with 45-second rate limiting cooldown."""
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

    can_resend, remaining = check_otp_resend_cooldown(clean_email)
    if not can_resend:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Resend available in {remaining} seconds. Please wait before requesting another code.",
        )

    otp_code, _ = create_or_update_otp(db, clean_email, purpose=payload.purpose)
    delivery = send_email_otp(clean_email, otp_code, purpose=payload.purpose)

    resp: dict[str, Any] = {
        "status": "sent",
        "message": (
            "A fresh verification code has been sent to your Gmail inbox."
            if delivery.success
            else "Verification code generated. (Note: Gmail SMTP credentials are not yet configured in backend/.env)"
        ),
        "email": clean_email,
        "masked_email": mask_email(clean_email),
        "cooldown_seconds": config.OTP_RESEND_COOLDOWN_SECONDS,
        "email_delivered": delivery.success,
        "delivery_status": delivery.status_code,
        "delivery_message": delivery.message,
    }

    if config.EMAIL_OTP_MODE == "test":
        dev_code = get_dev_otp(clean_email)
        if dev_code:
            resp["dev_otp"] = dev_code

    return resp


# ---------------------------------------------------------------------------
# Login & Session Endpoints
# ---------------------------------------------------------------------------

@auth_router.post("/login")
def login_user(
    payload: UserLoginRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Authenticate user using email and password.
    Enforces email verification before granting access.
    """
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. Please check your credentials.",
        )

    if not user.email_verified:
        dev_code = get_dev_otp(clean_email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Your email address is not verified yet. Please verify your email with the verification code sent to you.",
                "email": clean_email,
                "dev_otp": dev_code,
            },
        )

    token = create_access_token({
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    })

    return {
        "status": "authenticated",
        "message": f"Welcome back, {user.full_name}!",
        "access_token": token,
        "token_type": "bearer",
        "user": _build_safe_user_dict(user, db),
    }


# ---------------------------------------------------------------------------
# Password Recovery Endpoints
# ---------------------------------------------------------------------------

@auth_router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Initiate password recovery.
    Sends 6-digit OTP to registered email. Returns generic response to avoid account enumeration.
    """
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()

    dev_code = None
    delivery = None
    if user and user.email_verified:
        otp_code, _ = create_or_update_otp(db, clean_email, purpose="PASSWORD_RESET")
        delivery = send_email_otp(clean_email, otp_code, purpose="Password Reset")
        dev_code = get_dev_otp(clean_email)

    resp: dict[str, Any] = {
        "status": "initiated",
        "message": "If an account exists for this email, we've sent instructions to continue.",
        "email": clean_email,
        "masked_email": mask_email(clean_email),
    }
    if delivery is not None:
        resp["email_delivered"] = delivery.success
        resp["delivery_status"] = delivery.status_code
        resp["delivery_message"] = delivery.message

    if dev_code and config.EMAIL_OTP_MODE == "test":
        resp["dev_otp"] = dev_code

    return resp


@auth_router.post("/reset-password")
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Verify OTP and update user password securely."""
    clean_email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid request or expired verification code.",
        )

    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Passwords do not match.")

    valid_pw, pw_err = validate_password_strength(payload.new_password)
    if not valid_pw:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=pw_err)

    success, msg = verify_email_otp(db, clean_email, payload.otp_code, purpose="PASSWORD_RESET")
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

    user.password_hash = hash_password(payload.new_password)
    db.commit()

    return {
        "status": "success",
        "message": "Password updated successfully. You can now log in with your new password.",
    }


# ---------------------------------------------------------------------------
# Profile & Session Inspection Endpoints
# ---------------------------------------------------------------------------

@auth_router.get("/me")
def get_authenticated_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Retrieve safe profile representation of the current logged-in user."""
    return _build_safe_user_dict(current_user, db)


@profile_router.get("/profile")
def get_customer_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Customer profile endpoint providing masked identity details and registered vehicle specs."""
    return _build_safe_user_dict(current_user, db)


@profile_router.put("/profile")
def update_customer_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update editable profile and vehicle fields."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()

    if payload.phone is not None:
        valid_p, norm_p, p_err = validate_and_normalize_phone(payload.phone)
        if not valid_p:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=p_err)
        current_user.phone = norm_p

    if payload.city is not None:
        current_user.city = payload.city.strip()
    if payload.state is not None:
        current_user.state = payload.state.strip()
    if payload.pincode is not None:
        current_user.pincode = payload.pincode.strip()

    veh = db.query(UserVehicle).filter(UserVehicle.user_id == current_user.id).first()
    if veh:
        if payload.city is not None:
            veh.city = payload.city.strip()
        if payload.state is not None:
            veh.state = payload.state.strip()
        if payload.pincode is not None:
            veh.pincode = payload.pincode.strip()
        if payload.odometer_km is not None:
            veh.odometer_km = payload.odometer_km
        if payload.vehicle_number is not None:
            valid_v, norm_v, v_err = validate_and_normalize_vehicle_number(payload.vehicle_number)
            if not valid_v:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=v_err)
            veh.vehicle_number = norm_v
        if payload.vehicle_manufacturer is not None:
            veh.manufacturer = payload.vehicle_manufacturer.strip()
        if payload.vehicle_model is not None:
            veh.model = payload.vehicle_model.strip()
        if payload.vehicle_purchase_year is not None:
            veh.purchase_year = payload.vehicle_purchase_year

    db.commit()
    return {
        "status": "updated",
        "message": "Profile updated successfully.",
        "user": _build_safe_user_dict(current_user, db),
    }


@auth_router.delete("/me")
@auth_router.delete("/account")
@profile_router.delete("/account")
def delete_user_account(
    payload: DeleteAccountRequest | None = Body(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Permanently delete the authenticated user's account and all associated data.
    Removes user vehicles, diagnostic customer assessments, and OTPs.
    Optionally validates account password for confirmed authorization.
    """
    # Safety protection for demo root administrator
    if current_user.email == "admin@evolve.ai" and current_user.role == "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System root administrator account cannot be deleted in demo mode.",
        )

    # If password is provided, verify it
    if payload and payload.password:
        if not verify_password(payload.password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect password. Account deletion aborted.",
            )

    user_id = current_user.id
    user_email = current_user.email

    try:
        # 1. Clean up associated assessments
        db.query(CustomerAssessment).filter(CustomerAssessment.user_id == user_id).delete(synchronize_session=False)

        # 2. Clean up associated user vehicles
        db.query(UserVehicle).filter(UserVehicle.user_id == user_id).delete(synchronize_session=False)

        # 3. Clean up any pending email verification OTPs
        db.query(EmailOTP).filter(EmailOTP.email == user_email).delete(synchronize_session=False)

        # 4. Delete the user
        db.delete(current_user)
        db.commit()

        logger.info("Successfully deleted user id=%s (%s)", user_id, user_email)

        return {
            "status": "success",
            "message": "Your EVolve AI account and associated data have been permanently deleted.",
        }
    except Exception as exc:
        db.rollback()
        logger.error("Failed to delete account for user %s: %s", user_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again later.",
        )


@admin_router.get("/overview")
def get_admin_overview(
    admin_user: User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Admin-only ecosystem overview route."""
    return {
        "status": "authorized",
        "admin_user": admin_user.username,
        "role": admin_user.role,
        "message": "Admin authorization verified.",
    }
