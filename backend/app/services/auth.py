"""
Authentication, Identity, Password Hashing, and Email OTP Services for EVolve AI.

Security Architecture:
  1. Passwords hashed using PBKDF2-HMAC-SHA256 (100,000 rounds) with cryptographically random salt.
  2. Tokens signed with HMAC-SHA256 and configurable expiry.
  3. 6-digit Email OTPs with cryptographic hash storage, 5-minute expiry, max 5 attempts, and resend rate limiting.
  4. Secure Aadhaar tokenization & masked representation (XXXX-XXXX-1234).
  5. Privacy-first data masking for email, phone, and vehicle registration numbers.
  6. Zero plain-text credentials stored or returned to clients.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .. import config
from ..database.base import get_db
from ..database.models import EmailOTP, User, UserVehicle

logger = logging.getLogger("evolve.auth")

security_bearer = HTTPBearer(auto_error=False)

# In-memory rate-limiter store for OTP resends and login attempts:
# key: email -> list of attempt datetimes
_RATE_LIMIT_STORE: dict[str, list[datetime]] = {}
_LAST_OTP_SENT_STORE: dict[str, datetime] = {}

# Dev-mode OTP cache so development / test environments can inspect generated codes without SMTP
_DEV_MODE_OTP_CACHE: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Password Hashing & Verification (PBKDF2-HMAC-SHA256)
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with a 16-byte cryptographically random salt."""
    salt = secrets.token_bytes(16)
    iterations = 100_000
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${derived.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against stored PBKDF2-HMAC-SHA256 hash using constant-time comparison."""
    try:
        parts = hashed_password.split("$")
        if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
            return False
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_hash = bytes.fromhex(parts[3])
        actual_hash = hashlib.pbkdf2_hmac("sha256", plain_password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual_hash, expected_hash)
    except Exception:
        return False


def validate_password_strength(password: str) -> tuple[bool, str | None]:
    """Validate password against security requirements."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."
    return True, None


# ---------------------------------------------------------------------------
# Input Validation & Normalization
# ---------------------------------------------------------------------------

def validate_username(username: str) -> tuple[bool, str | None]:
    """Username must be 3-30 characters, alphanumeric and underscores only."""
    clean = username.strip()
    if not re.match(r"^[a-zA-Z0-9_]{3,30}$", clean):
        return False, "Username must be 3-30 characters and contain only letters, numbers, or underscores."
    return True, None


def validate_email_address(email: str) -> tuple[bool, str | None]:
    """Basic RFC 5322 compatible email address check."""
    clean = email.strip()
    if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", clean):
        return False, "Please enter a valid email address."
    return True, None


def validate_and_normalize_phone(phone: str) -> tuple[bool, str, str | None]:
    """
    Validate Indian phone numbers (10 digits starting with 6-9, optionally with +91 or 0).
    Returns (is_valid, normalized_phone, error_message).
    """
    cleaned = re.sub(r"[\s\-\(\)]", "", phone.strip())
    if cleaned.startswith("+91"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("0"):
        cleaned = cleaned[1:]

    if re.match(r"^[6-9]\d{9}$", cleaned):
        return True, f"+91 {cleaned[:5]} {cleaned[5:]}", None
    return False, phone, "Please enter a valid 10-digit Indian phone number (e.g. +91 9876543210)."


def validate_and_normalize_vehicle_number(veh_no: str) -> tuple[bool, str, str | None]:
    """
    Validate and normalize Indian vehicle registration format.
    Accepts standard state formats (e.g. TS09AB1234, DL1CAB1234, MH12DE1234) as well as BH series.
    """
    clean = re.sub(r"[\s\-]", "", veh_no.strip()).upper()
    # Standard: 2 letters state + 1-2 digits district + optional 1-3 letters series + 4 digits number
    # or Bharat series (e.g. 22BH1234AA)
    state_pattern = r"^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$"
    bh_pattern = r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$"

    if re.match(state_pattern, clean) or re.match(bh_pattern, clean):
        return True, clean, None

    # Lenient check for legitimate custom/fleet EV formats (at least 6-12 alphanumeric characters)
    if re.match(r"^[A-Z0-9]{6,12}$", clean):
        return True, clean, None

    return False, clean, "Please enter a valid vehicle registration number (e.g. TS09AB1234)."


def validate_and_tokenize_aadhaar(aadhaar: str | None) -> tuple[bool, str | None, str | None, str | None]:
    """
    Validate optional Aadhaar number (12 digits).
    Returns (is_valid, encrypted_token, last4, error_message).
    Never stores or returns full Aadhaar number in plain text.
    """
    if not aadhaar or not aadhaar.strip():
        return True, None, None, None

    clean = re.sub(r"[\s\-]", "", aadhaar.strip())
    if not re.match(r"^\d{12}$", clean):
        return False, None, None, "Aadhaar number must be a 12-digit number (e.g. 1234 5678 9012)."

    last4 = clean[-4:]
    # Secure tokenization using HMAC-SHA256 with server secret key
    salt = config.AADHAAR_SECRET_KEY.encode("utf-8")
    token = hmac.new(salt, clean.encode("utf-8"), hashlib.sha256).hexdigest()
    return True, f"aadhaar_enc_{token[:32]}", last4, None


# ---------------------------------------------------------------------------
# Privacy Data Masking Utilities
# ---------------------------------------------------------------------------

def mask_email(email: str) -> str:
    """Mask email address (e.g. saiteja@example.com -> sa****@example.com)."""
    try:
        user_part, domain_part = email.split("@", 1)
        if len(user_part) <= 2:
            masked_user = user_part[0] + "****" if user_part else "****"
        else:
            masked_user = user_part[:2] + "****"
        return f"{masked_user}@{domain_part}"
    except Exception:
        return "******@evolve.ai"


def mask_phone(phone: str) -> str:
    """Mask phone number (e.g. +91 98765 43210 -> +91 ******3210)."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 10:
        last4 = digits[-4:]
        return f"+91 ******{last4}"
    return "+91 ******"


def mask_vehicle_number(veh_no: str) -> str:
    """Mask vehicle registration number for general dashboard display (e.g. TS09AB1234 -> TS09AB****)."""
    clean = re.sub(r"[\s\-]", "", veh_no).upper()
    if len(clean) >= 6:
        prefix = clean[:-4]
        return f"{prefix}****"
    return "****"


def mask_aadhaar(last4: str | None) -> str:
    """Return standard masked Aadhaar representation (e.g. XXXX-XXXX-1234)."""
    if last4 and len(last4) == 4:
        return f"XXXX-XXXX-{last4}"
    return "Not Provided"


# ---------------------------------------------------------------------------
# Email OTP Generation, Hashing & Verification
# ---------------------------------------------------------------------------

def _hash_otp(email: str, otp_code: str) -> str:
    """Derive one-way cryptographic hash of OTP combined with email and server secret."""
    combined = f"{email.lower().strip()}:{otp_code}:{config.JWT_SECRET_KEY}"
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def generate_6digit_otp() -> str:
    """Generate a crypto-secure 6-digit numeric OTP."""
    # secrets.randbelow ensures uniform distribution [100000, 999999]
    return str(secrets.randbelow(900000) + 100000)


def create_or_update_otp(
    db: Session,
    email: str,
    purpose: str = "REGISTRATION",
) -> tuple[str, datetime]:
    """
    Create a new OTP record for the email.
    Invalidates any existing active OTPs for the same purpose.
    Returns (plain_otp_code, expires_at).
    """
    clean_email = email.lower().strip()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=config.OTP_EXPIRY_MINUTES)
    otp_code = generate_6digit_otp()
    hashed_otp = _hash_otp(clean_email, otp_code)

    # Invalidate previous unverified OTPs for this email and purpose
    db.query(EmailOTP).filter(
        EmailOTP.email == clean_email,
        EmailOTP.purpose == purpose,
        EmailOTP.verified_at.is_(None),
    ).delete(synchronize_session=False)

    new_otp = EmailOTP(
        email=clean_email,
        purpose=purpose,
        otp_hash=hashed_otp,
        expires_at=expires_at,
        attempt_count=0,
        max_attempts=config.OTP_MAX_ATTEMPTS,
        created_at=now,
    )
    db.add(new_otp)
    db.commit()

    # Track in dev cache
    _DEV_MODE_OTP_CACHE[clean_email] = otp_code
    _LAST_OTP_SENT_STORE[clean_email] = now

    logger.info("Generated %s OTP for %s (expires in %d min)", purpose, mask_email(clean_email), config.OTP_EXPIRY_MINUTES)
    return otp_code, expires_at


def verify_email_otp(
    db: Session,
    email: str,
    otp_code: str,
    purpose: str = "REGISTRATION",
) -> tuple[bool, str]:
    """
    Verify 6-digit OTP code against stored hash.
    Enforces expiry (5 min), max attempts (5), and single-use invalidation.
    Returns (success, message).
    """
    clean_email = email.lower().strip()
    now = datetime.now(timezone.utc)

    otp_record = (
        db.query(EmailOTP)
        .filter(
            EmailOTP.email == clean_email,
            EmailOTP.purpose == purpose,
            EmailOTP.verified_at.is_(None),
        )
        .order_by(EmailOTP.id.desc())
        .first()
    )

    if not otp_record:
        return False, "No active verification code found for this email. Please request a new code."

    # Check attempt count
    if otp_record.attempt_count >= otp_record.max_attempts:
        return False, "Too many attempts. Please request a new verification code."

    # Increment attempt count
    otp_record.attempt_count += 1

    # Check expiration
    # Handle naive vs aware datetime comparison safely
    record_expires = otp_record.expires_at
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)

    if now > record_expires:
        db.commit()
        return False, "Verification code has expired. Please request a new code."

    expected_hash = _hash_otp(clean_email, otp_code.strip())
    if not hmac.compare_digest(otp_record.otp_hash, expected_hash):
        db.commit()
        remaining = max(0, otp_record.max_attempts - otp_record.attempt_count)
        return False, f"Invalid verification code. {remaining} attempt(s) remaining."

    # Mark as verified
    otp_record.verified_at = now
    db.commit()

    # Remove from dev cache
    _DEV_MODE_OTP_CACHE.pop(clean_email, None)

    return True, "Email verified successfully."


def check_otp_resend_cooldown(email: str) -> tuple[bool, int]:
    """
    Check if the user is in cooldown period (45 seconds) before resending OTP.
    Returns (can_resend, remaining_seconds).
    """
    clean_email = email.lower().strip()
    last_sent = _LAST_OTP_SENT_STORE.get(clean_email)
    if not last_sent:
        return True, 0

    now = datetime.now(timezone.utc)
    if last_sent.tzinfo is None:
        last_sent = last_sent.replace(tzinfo=timezone.utc)

    elapsed = (now - last_sent).total_seconds()
    cooldown = config.OTP_RESEND_COOLDOWN_SECONDS
    if elapsed < cooldown:
        return False, int(cooldown - elapsed)

    return True, 0


def get_dev_otp(email: str) -> str | None:
    """Retrieve active OTP in test mode for automated pytest suites."""
    if config.EMAIL_OTP_MODE == "test":
        return _DEV_MODE_OTP_CACHE.get(email.lower().strip())
    return None


# ---------------------------------------------------------------------------
class EmailDeliveryResult:
    """Carries delivery status while evaluating cleanly as a boolean in conditional statements."""
    def __init__(self, success: bool, message: str, status_code: str = "OK"):
        self.success = success
        self.message = message
        self.status_code = status_code

    def __bool__(self) -> bool:
        return self.success

    def __repr__(self) -> str:
        return f"EmailDeliveryResult(success={self.success}, status_code='{self.status_code}', message='{self.message}')"


def _reload_smtp_settings():
    """Dynamically re-read SMTP settings from environment and .env files on each invocation."""
    try:
        from dotenv import load_dotenv
        load_dotenv(config.ROOT_DIR / ".env", override=True)
        load_dotenv(config.BASE_DIR / ".env", override=True)
    except Exception:
        pass

    import os
    host = os.environ.get("SMTP_HOST", config.SMTP_HOST).strip()
    port = int(os.environ.get("SMTP_PORT", str(config.SMTP_PORT)))
    username = os.environ.get("SMTP_USERNAME", config.SMTP_USERNAME).strip()
    password = os.environ.get("SMTP_PASSWORD", config.SMTP_PASSWORD).strip()
    from_email = os.environ.get("SMTP_FROM_EMAIL", config.SMTP_FROM_EMAIL).strip() or username
    use_ssl = os.environ.get("SMTP_USE_SSL", str(config.SMTP_USE_SSL)).strip().lower() in ("true", "1", "yes")
    return host, port, username, password, from_email, use_ssl


def send_email_otp(to_email: str, otp_code: str, purpose: str = "Email Verification") -> EmailDeliveryResult:
    """
    Send verification code via email.
    If SMTP credentials are provided, delivers directly to recipient's inbox.
    Otherwise, logs instructions to configure SMTP in backend/.env.
    """
    clean_email = to_email.lower().strip()
    masked = mask_email(clean_email)

    host, port, username, password, from_email, use_ssl = _reload_smtp_settings()

    # 1. Live SMTP Dispatch (Gmail / TLS / SSL)
    if host and username and password:
        try:
            import importlib
            smtplib_mod = importlib.import_module("smtplib")
            mime_multipart = importlib.import_module("email.mime.multipart")
            mime_text_mod = importlib.import_module("email.mime.text")
            email_utils = importlib.import_module("email.utils")
            MIMEMultipart = getattr(mime_multipart, "MIMEMultipart")
            MIMEText = getattr(mime_text_mod, "MIMEText")

            from_addr = from_email or username

            # Subject line optimized for transactional inbox deliverability:
            if "reset" in purpose.lower():
                subject = "Your EVolve AI password reset code"
            else:
                subject = "Your EVolve AI verification code"

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"EVolve AI <{from_addr}>"
            msg["To"] = clean_email
            msg["Reply-To"] = from_addr
            msg["Date"] = email_utils.formatdate(localtime=True)
            msg["Message-ID"] = email_utils.make_msgid(domain="gmail.com")
            msg["X-Mailer"] = "EVolve AI Notification Engine v1.0"
            msg["Auto-Submitted"] = "auto-generated"

            text_content = (
                f"Hello,\n\n"
                f"Your EVolve AI verification code is: {otp_code}\n\n"
                f"This code will expire in {config.OTP_EXPIRY_MINUTES} minutes. "
                f"For your security, please do not share this code with anyone.\n\n"
                f"If you did not request this verification code, please ignore this email.\n\n"
                f"— The EVolve AI Team\n"
                f"Circular EV Battery Intelligence Platform\n"
            )

            html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9f6; margin: 0; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <div style="display: inline-block; background: #166534; color: #ffffff; font-weight: bold; font-size: 13px; padding: 6px 14px; border-radius: 8px; margin-bottom: 20px;">🌿 EVolve AI</div>
    <h2 style="color: #0f172a; margin: 0 0 12px; font-size: 20px;">{purpose}</h2>
    <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 16px;">
      Hello,<br><br>
      Please enter the following 6-digit verification code to confirm your EV account and access your battery intelligence portal:
    </p>
    <div style="background: #f0fdf4; border: 2px dashed #22c55e; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
      <span style="font-family: 'Courier New', monospace; font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #15803d;">{otp_code}</span>
    </div>
    <p style="color: #64748b; font-size: 12.5px; line-height: 1.5; margin: 0 0 16px;">
      This code expires in <strong>{config.OTP_EXPIRY_MINUTES} minutes</strong>. For your security, never share this code with anyone.
    </p>
    <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; text-align: center; font-size: 11.5px; color: #94a3b8; line-height: 1.5;">
      EVolve AI — Circular EV Battery Intelligence<br>
      Predict · Prevent · Reuse · Collect · Recycle · Track<br>
      <span style="color: #cbd5e1; font-size: 10.5px;">This is an automated security message. If you did not make this request, you can safely ignore this email.</span>
    </div>
  </div>
</body>
</html>"""

            msg.attach(MIMEText(text_content, "plain", "utf-8"))
            msg.attach(MIMEText(html_content, "html", "utf-8"))

            if use_ssl or port == 465:
                server = smtplib_mod.SMTP_SSL(host, port, timeout=12.0)
            else:
                server = smtplib_mod.SMTP(host, port, timeout=12.0)
                server.starttls()

            clean_password = password.replace(" ", "").strip()
            try:
                server.login(username, clean_password)
            except Exception:
                server.login(username, password)
            server.send_message(msg)
            server.quit()
            logger.info("Successfully delivered %s email to %s via SMTP (%s)", purpose, masked, host)
            return EmailDeliveryResult(True, f"Delivered to {masked} via Gmail SMTP", "DELIVERED")
        except Exception as exc:
            logger.error("Failed to send email OTP to %s via SMTP: %s", masked, exc)
            return EmailDeliveryResult(False, f"SMTP delivery failed: {exc}", "SMTP_ERROR")

    # 2. Test / Unconfigured Mode Notice
    logger.warning(
        "\n"
        "==========================================================\n"
        " [EVolve AI - EMAIL DELIVERY NOTICE]\n"
        " SMTP credentials not configured in backend/.env.\n"
        " To deliver OTP directly to Gmail, please set:\n"
        "   SMTP_USERNAME=your_gmail@gmail.com\n"
        "   SMTP_PASSWORD=your_16_char_google_app_password\n"
        " --------------------------------------------------------\n"
        " Code generated for %s (%s): %s\n"
        "==========================================================",
        masked, clean_email, otp_code
    )
    return EmailDeliveryResult(
        False,
        "Gmail SMTP credentials are not yet configured in backend/.env. Please enter your SMTP_USERNAME and Google App Password.",
        "NOT_CONFIGURED"
    )


# ---------------------------------------------------------------------------
# JWT / HMAC-SHA256 Token Handling
# ---------------------------------------------------------------------------

def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = len(data) % 4
    if padding:
        data += "=" * (4 - padding)
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def create_access_token(payload_data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Generate a self-contained signed HMAC-SHA256 JWT access token."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=config.JWT_EXPIRY_HOURS)

    claims = dict(payload_data)
    claims["iat"] = int(now.timestamp())
    claims["exp"] = int(expire.timestamp())

    header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    claims_bytes = json.dumps(claims, separators=(",", ":")).encode("utf-8")

    unsigned_token = f"{_b64encode(header_bytes)}.{_b64encode(claims_bytes)}"
    signature = hmac.new(
        config.JWT_SECRET_KEY.encode("utf-8"),
        unsigned_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    return f"{unsigned_token}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Validate signature, check expiration, and decode JWT payload."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None

        header_b64, claims_b64, sig_b64 = parts
        unsigned_token = f"{header_b64}.{claims_b64}"

        # Verify signature
        expected_sig = hmac.new(
            config.JWT_SECRET_KEY.encode("utf-8"),
            unsigned_token.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        actual_sig = _b64decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        claims = json.loads(_b64decode(claims_b64).decode("utf-8"))
        now_ts = int(datetime.now(timezone.utc).timestamp())

        # Check expiration
        if "exp" in claims and claims["exp"] < now_ts:
            return None

        return claims
    except Exception:
        return None


# ---------------------------------------------------------------------------
# FastAPI Auth Dependencies
# ---------------------------------------------------------------------------

def get_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Enforces active authenticated session. Raises HTTP 401 if missing or invalid."""
    if not auth or not auth.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = decode_access_token(auth.credentials)
    if not claims or "sub" not in claims:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = claims["sub"]
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def get_optional_current_user(
    auth: HTTPAuthorizationCredentials | None = Depends(security_bearer),
    db: Session = Depends(get_db),
) -> User | None:
    """Returns current User if valid token is provided, otherwise None without raising 401."""
    if not auth or not auth.credentials:
        return None
    claims = decode_access_token(auth.credentials)
    if not claims or "sub" not in claims:
        return None
    return db.query(User).filter(User.id == claims["sub"]).first()


def require_role(allowed_roles: list[str]):
    """Role authorization guard dependency factory (e.g. ['ADMIN'])."""
    def _role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {', '.join(allowed_roles)}.",
            )
        return user
    return _role_checker
