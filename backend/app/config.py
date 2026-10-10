"""EVolve AI configuration."""

from __future__ import annotations

import os
from pathlib import Path

# joblib/loky probe CPU count via a subprocess that is noisy and slow on Windows.
os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")
os.environ.setdefault("JOBLIB_MULTIPROCESSING", "0")

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
ROOT_DIR = BASE_DIR.parent                                  # project root

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass
DATA_DIR = ROOT_DIR / "data" / "demo"
ARTIFACT_DIR = BASE_DIR / "artifacts"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

MODEL_SOH_PATH = ARTIFACT_DIR / "soh_model.joblib"
MODEL_EOL_PATH = ARTIFACT_DIR / "eol_model.joblib"
MODEL_ANOMALY_PATH = ARTIFACT_DIR / "anomaly_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "metrics.json"
UPLOAD_DIR = ARTIFACT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# --- Database --------------------------------------------------------------
# SQLite for hackathon reliability. The URL is the ONLY place the dialect is
# named, and no SQLAlchemy construct is SQLite-specific, so switching to
# PostgreSQL is a URL change (see database/base.py).
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(BASE_DIR / 'evolve.db').as_posix()}")

# --- Demo dataset ----------------------------------------------------------
DEMO_FLEET_COUNT = int(os.environ.get("DEMO_FLEET_COUNT", "75"))
#: Cohort size used to TRAIN and EVALUATE models. Much larger than the demo
#: fleet so precision/recall rest on enough positive cases to mean something.
EVALUATION_COHORT_SIZE = int(os.environ.get("EVALUATION_COHORT_SIZE", "1200"))
RANDOM_SEED = int(os.environ.get("RANDOM_SEED", "20261003"))

# --- Lifecycle thresholds --------------------------------------------------
#: SOH at or below which a pack becomes a potential EOL candidate.
EOL_SOH_THRESHOLD = 0.80
#: SOH at or below which continued traction use is no longer supported.
UNFIT_FOR_TRACTION_SOH = 0.70
#: SOH at or below which a pack is unsuitable even for stationary second-life.
SECOND_LIFE_FLOOR_SOH = 0.55
#: Nominal end-of-life horizon used by the forecaster, in months.
FORECAST_HORIZON_MONTHS = 12

# --- Data confidence thresholds --------------------------------------------
CONFIDENCE_HIGH = 75.0
CONFIDENCE_MODERATE = 50.0

# --- Downstream capacity (units = battery packs) ---------------------------
DEFAULT_PROCESSING_CAPACITY_PER_MONTH = 30
DEFAULT_COLLECTION_CAPACITY_PER_MONTH = 40
DEFAULT_COLLECTION_TRIPS_PER_MONTH = 8
DEFAULT_TRIP_CAPACITY_UNITS = 6

# --- GenAI (OPTIONAL) ------------------------------------------------------
GENAI_API_KEY = os.environ.get("GENAI_API_KEY", "").strip()
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.0-flash")
GENAI_ENDPOINT = os.environ.get(
    "GENAI_ENDPOINT", "https://generativelanguage.googleapis.com/v1beta/models"
)
GENAI_TIMEOUT_SECONDS = float(os.environ.get("GENAI_TIMEOUT_SECONDS", "6.0"))

# --- Server ----------------------------------------------------------------
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "8000"))

# --- Authentication & OTP --------------------------------------------------
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "evolve-ai-jwt-secret-key-2026-circular-battery-sec")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))

EMAIL_OTP_MODE = os.environ.get("EMAIL_OTP_MODE", "live").strip().lower()
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", "5"))
OTP_MAX_ATTEMPTS = int(os.environ.get("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.environ.get("OTP_RESEND_COOLDOWN_SECONDS", "45"))

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USERNAME = os.environ.get("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.environ.get("SMTP_FROM_EMAIL", "").strip() or SMTP_USERNAME
SMTP_USE_SSL = os.environ.get("SMTP_USE_SSL", "false").strip().lower() in ("true", "1", "yes")

AADHAAR_SECRET_KEY = os.environ.get("AADHAAR_SECRET_KEY", "evolve-aadhaar-salt-key-2026")