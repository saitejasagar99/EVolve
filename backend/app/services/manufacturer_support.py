"""
EVolve AI — Verified Vehicle Manufacturer Support Directory & Advisory Service.

Provides maintainable, verified customer support contacts, authorized service
centre locators, and diagnostic confirmation guidance when battery replacement
or second-life retirement is evaluated.

Principles:
1. Grounded in Official Sources Only: No third-party scrapers, AI-generated numbers, or unverified claims.
2. Separation of Concerns: Clear boundary between AI statistical degradation prediction,
   preliminary economic estimate, and certified diagnostic test confirmation.
3. Fallback Integrity: When an official number is unavailable, unverified, or outdated,
   safely guide the customer to the manufacturer's official support portal without guessing.
4. Safety First: Critical safety symptoms (thermal runaway, insulation faults) prioritize
   immediate stop-use and qualified roadside assistance over service centre visits.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.database.models import ManufacturerSupport


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


#: Checklist: "Questions to Ask Before Replacing Your Battery" (Section 5)
QUESTIONS_TO_ASK_MANUFACTURER: list[str] = [
    "Has a diagnostic test confirmed that the battery pack needs replacement?",
    "Can the problem be repaired, or is a module-level repair or replacement supported for this vehicle?",
    "What fault codes or test results justify full-pack replacement?",
    "Is the battery covered by the manufacturer's battery warranty?",
    "Is there a software update, service bulletin, recall, or warranty procedure relevant to this issue?",
    "What is the cost of diagnosis, repair, module replacement, and full-pack replacement, where applicable?",
    "Is the proposed replacement pack compatible with this exact vehicle variant?",
    "Can the authorized service centre provide a written diagnostic report and estimate?",
]

#: Curated official verified directory seed data
DEFAULT_SUPPORT_DIRECTORY: list[dict[str, Any]] = [
    {
        "manufacturer_id": "tata-motors",
        "manufacturer_name": "Tata Passenger Electric Mobility",
        "brand_aliases": [
            "tata",
            "tata motors",
            "tata ev",
            "tiago ev",
            "tigor ev",
            "nexon ev",
            "nexon ev max",
            "punch ev",
            "curvv ev",
            "harrier ev",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 209 8282",
        "support_phone_normalized": "+9118002098282",
        "support_url": "https://ev.tatamotors.com",
        "service_locator_url": "https://ev.tatamotors.com/locate-dealer.html",
        "support_hours": "24/7 Dedicated Toll-Free EV Assistance",
        "source_url": "https://ev.tatamotors.com",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official 24/7 toll-free helpline for Tata EV owners.",
    },
    {
        "manufacturer_id": "mg-motor",
        "manufacturer_name": "MG Motor India",
        "brand_aliases": [
            "mg",
            "mg motor",
            "morris garages",
            "zs ev",
            "comet ev",
            "windsor ev",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 100 6464",
        "support_phone_normalized": "+9118001006464",
        "support_url": "https://www.mgmotor.co.in",
        "service_locator_url": "https://www.mgmotor.co.in/dealers",
        "support_hours": "24/7 Pulse Hub Customer Support",
        "source_url": "https://www.mgmotor.co.in/tools/contact-us",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official 24x7 Pulse Hub toll-free care for MG EV owners.",
    },
    {
        "manufacturer_id": "mahindra",
        "manufacturer_name": "Mahindra Electric (Automotive Division)",
        "brand_aliases": [
            "mahindra",
            "mahindra & mahindra",
            "mahindra electric",
            "xuv400",
            "e2o",
            "be.05",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 209 6006",
        "support_phone_normalized": "+9118002096006",
        "support_url": "https://auto.mahindra.com",
        "service_locator_url": "https://auto.mahindra.com/dealer-locator",
        "support_hours": "Mon-Sun 8:00 AM - 8:00 PM IST (Roadside: 24/7)",
        "source_url": "https://auto.mahindra.com/service/with-you-hamesha",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Mahindra 'With You Hamesha' official customer care helpline.",
    },
    {
        "manufacturer_id": "hyundai",
        "manufacturer_name": "Hyundai Motor India",
        "brand_aliases": [
            "hyundai",
            "kona",
            "kona electric",
            "ioniq",
            "ioniq 5",
            "creta ev",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 11 4645",
        "support_phone_normalized": "+911800114645",
        "support_url": "https://www.hyundai.com/in",
        "service_locator_url": "https://www.hyundai.com/in/en/find-a-car/dealer-locator",
        "support_hours": "24/7 Customer Care & EV High-Voltage Helpline",
        "source_url": "https://www.hyundai.com/in/en/connect-to-service/customer-care",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official Hyundai Motor India toll-free customer care.",
    },
    {
        "manufacturer_id": "byd",
        "manufacturer_name": "BYD Auto India",
        "brand_aliases": [
            "byd",
            "build your dreams",
            "atto 3",
            "byd seal",
            "byd e6",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 203 1888",
        "support_phone_normalized": "+9118002031888",
        "support_url": "https://bydautoindia.com",
        "service_locator_url": "https://bydautoindia.com/dealer-locator",
        "support_hours": "Mon-Sat 9:00 AM - 6:00 PM IST",
        "source_url": "https://bydautoindia.com/contact-us",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official BYD passenger vehicles customer care in India.",
    },
    {
        "manufacturer_id": "ola-electric",
        "manufacturer_name": "Ola Electric Mobility",
        "brand_aliases": [
            "ola",
            "ola electric",
            "s1",
            "s1 pro",
            "s1 air",
            "s1 x",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "080-33113311",
        "support_phone_normalized": "+918033113311",
        "support_url": "https://www.olaelectric.com/support",
        "service_locator_url": "https://www.olaelectric.com/experience-centres",
        "support_hours": "Mon-Sun 9:00 AM - 7:00 PM IST",
        "source_url": "https://www.olaelectric.com/support",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official Ola customer assistance and service escalation line.",
    },
    {
        "manufacturer_id": "ather-energy",
        "manufacturer_name": "Ather Energy",
        "brand_aliases": [
            "ather",
            "ather energy",
            "450x",
            "450s",
            "450 apex",
            "rizta",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 103 4404",
        "support_phone_normalized": "+9118001034404",
        "support_url": "https://www.atherenergy.com",
        "service_locator_url": "https://www.atherenergy.com/experience-centres",
        "support_hours": "Mon-Sun 8:00 AM - 9:00 PM IST",
        "source_url": "https://www.atherenergy.com/contact",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official Ather Energy national customer care toll-free line.",
    },
    {
        "manufacturer_id": "kia",
        "manufacturer_name": "Kia India",
        "brand_aliases": [
            "kia",
            "ev6",
            "ev9",
        ],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 108 5000",
        "support_phone_normalized": "+9118001085000",
        "support_url": "https://www.kia.com/in",
        "service_locator_url": "https://www.kia.com/in/buy/find-a-dealer.html",
        "support_hours": "Mon-Sun 9:00 AM - 9:00 PM IST",
        "source_url": "https://www.kia.com/in/service/overview.html",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official Kia toll-free customer support helpline.",
    },
    {
        "manufacturer_id": "tesla",
        "manufacturer_name": "Tesla, Inc.",
        "brand_aliases": [
            "tesla",
            "model 3",
            "model y",
            "model s",
            "model x",
            "cybertruck",
        ],
        "country_code": "US",
        "country_name": "United States",
        "support_phone": "1-888-518-3752",
        "support_phone_normalized": "+18885183752",
        "support_url": "https://www.tesla.com/support",
        "service_locator_url": "https://www.tesla.com/findus",
        "support_hours": "24/7 Roadside Assistance & Customer Support",
        "source_url": "https://www.tesla.com/support/customer-support",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "VERIFIED",
        "notes": "Official Tesla US customer and roadside helpline.",
    },
    {
        # Special case: Official website offers ONLY a service-centre locator (no verified phone)
        "manufacturer_id": "quantum-ev",
        "manufacturer_name": "Quantum Mobility",
        "brand_aliases": ["quantum", "quantum mobility", "quantum ev", "aeromobility"],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": None,
        "support_phone_normalized": None,
        "support_url": "https://quantum-ev.com/support",
        "service_locator_url": "https://quantum-ev.com/service-locator",
        "support_hours": None,
        "source_url": "https://quantum-ev.com/official-portal",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2026-10-10T00:00:00Z",
        "verification_status": "LOCATOR_ONLY",
        "notes": "Manufacturer provides online appointment scheduling and dealer locator only.",
    },
    {
        # Special case: Outdated contact record for testing requirement #4
        "manufacturer_id": "legacy-volt",
        "manufacturer_name": "Legacy Volt Motors",
        "brand_aliases": ["legacy volt", "volt motors"],
        "country_code": "IN",
        "country_name": "India",
        "support_phone": "1800 000 1111",
        "support_phone_normalized": "+9118000001111",
        "support_url": "https://legacyvolt.example.com",
        "service_locator_url": "https://legacyvolt.example.com/dealers",
        "support_hours": "Mon-Fri 10:00 AM - 5:00 PM IST",
        "source_url": "https://legacyvolt.example.com/contact",
        "source_label": "Contact information sourced from the official manufacturer website",
        "verified_at": "2024-01-01T00:00:00Z",
        "verification_status": "OUTDATED",
        "notes": "Verification expired. Requires re-verification before showing as verified phone.",
    },
]


def normalize_phone_number(phone: str | None) -> str | None:
    """
    Format phone number for standard clickable tel: URI links.
    Returns e.g. '+9118002098282' or '18002098282'.
    """
    if not phone:
        return None
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if not cleaned:
        return None
    return cleaned


def seed_default_manufacturer_support(db: Session) -> None:
    """Ensure standard manufacturer support records exist in database."""
    try:
        count = db.query(ManufacturerSupport).count()
        if count >= len(DEFAULT_SUPPORT_DIRECTORY):
            return

        existing_ids = {
            f"{r.manufacturer_id}:{r.country_code}"
            for r in db.query(ManufacturerSupport).all()
        }

        for item in DEFAULT_SUPPORT_DIRECTORY:
            key = f"{item['manufacturer_id']}:{item['country_code']}"
            if key not in existing_ids:
                verified_dt = datetime.fromisoformat(
                    item["verified_at"].replace("Z", "+00:00")
                )
                rec = ManufacturerSupport(
                    manufacturer_id=item["manufacturer_id"],
                    manufacturer_name=item["manufacturer_name"],
                    brand_aliases_json=json.dumps(item["brand_aliases"]),
                    country_code=item["country_code"],
                    country_name=item["country_name"],
                    support_phone=item["support_phone"],
                    support_phone_normalized=item["support_phone_normalized"],
                    support_url=item["support_url"],
                    service_locator_url=item["service_locator_url"],
                    support_hours=item["support_hours"],
                    source_url=item["source_url"],
                    source_label=item["source_label"],
                    verified_at=verified_dt,
                    verification_status=item["verification_status"],
                    notes=item["notes"],
                )
                db.add(rec)
        db.commit()
    except Exception:
        db.rollback()


def list_supported_manufacturers(
    db: Session | None = None,
    country_code: str | None = None,
) -> list[dict[str, Any]]:
    """List available manufacturers and their verified markets for UI selection."""
    if db is not None:
        try:
            seed_default_manufacturer_support(db)
            query = db.query(ManufacturerSupport)
            if country_code:
                query = query.filter(
                    ManufacturerSupport.country_code == country_code.upper()
                )
            records = query.all()
            if records:
                return [
                    {
                        "manufacturer_id": r.manufacturer_id,
                        "manufacturer_name": r.manufacturer_name,
                        "country_code": r.country_code,
                        "country_name": r.country_name,
                        "verification_status": r.verification_status,
                        "has_verified_phone": bool(
                            r.support_phone and r.verification_status == "VERIFIED"
                        ),
                        "service_locator_available": bool(r.service_locator_url),
                    }
                    for r in records
                ]
        except Exception:
            pass

    # Fallback from memory dictionary
    results = []
    for item in DEFAULT_SUPPORT_DIRECTORY:
        if country_code and item["country_code"] != country_code.upper():
            continue
        results.append(
            {
                "manufacturer_id": item["manufacturer_id"],
                "manufacturer_name": item["manufacturer_name"],
                "country_code": item["country_code"],
                "country_name": item["country_name"],
                "verification_status": item["verification_status"],
                "has_verified_phone": bool(
                    item["support_phone"] and item["verification_status"] == "VERIFIED"
                ),
                "service_locator_available": bool(item["service_locator_url"]),
            }
        )
    return results


def match_manufacturer_entry(
    brand: str | None,
    country_code: str | None = "IN",
    model: str | None = None,
    db: Session | None = None,
) -> dict[str, Any] | None:
    """
    Match manufacturer record from verified directory.
    Uses exact brand or verified brand aliases; never guesses or fabricates.
    """
    if not brand and not model:
        return None

    norm_brand = (brand or "").strip().lower()
    norm_country = (country_code or "IN").strip().upper()

    # Try DB first if session provided
    if db is not None:
        try:
            seed_default_manufacturer_support(db)
            records = (
                db.query(ManufacturerSupport)
                .filter(ManufacturerSupport.country_code == norm_country)
                .all()
            )
            for r in records:
                aliases = json.loads(r.brand_aliases_json) if r.brand_aliases_json else []
                aliases_lower = [a.lower() for a in aliases]
                if (
                    norm_brand in aliases_lower
                    or r.manufacturer_name.lower() == norm_brand
                    or any(a in norm_brand for a in aliases_lower if len(a) > 2)
                ):
                    return {
                        "manufacturer_id": r.manufacturer_id,
                        "manufacturer_name": r.manufacturer_name,
                        "country_code": r.country_code,
                        "country_name": r.country_name,
                        "support_phone": r.support_phone,
                        "support_phone_normalized": r.support_phone_normalized,
                        "support_url": r.support_url,
                        "service_locator_url": r.service_locator_url,
                        "support_hours": r.support_hours,
                        "source_url": r.source_url,
                        "source_label": r.source_label,
                        "verified_at": r.verified_at.isoformat(),
                        "verification_status": r.verification_status,
                        "notes": r.notes,
                    }
        except Exception:
            pass

    # In-memory lookup
    for item in DEFAULT_SUPPORT_DIRECTORY:
        if norm_country and item["country_code"] != norm_country:
            continue
        aliases = [a.lower() for a in item["brand_aliases"]]
        if (
            norm_brand in aliases
            or item["manufacturer_name"].lower() == norm_brand
            or any(a in norm_brand for a in aliases if len(a) > 2)
        ):
            return item.copy()

    return None


def build_manufacturer_advisory(
    brand: str | None,
    country_code: str | None = "IN",
    model: str | None = None,
    is_diagnostic_confirmed: bool = False,
    has_critical_warning: bool = False,
    db: Session | None = None,
) -> dict[str, Any]:
    """
    Construct the complete 'Verify Before You Replace' support advisory payload.

    Distinguishes strictly between:
      - Model-predicted degradation
      - Preliminary repair-versus-replacement recommendation
      - Diagnostic confirmation requirement
      - Critical battery warning override
    """
    # 1. Country resolution check
    country_known = bool(country_code and country_code.strip())
    resolved_country = country_code.strip().upper() if country_known else "IN"

    # 2. Manufacturer resolution check
    match = match_manufacturer_entry(
        brand=brand, country_code=resolved_country, model=model, db=db
    )
    manufacturer_identified = match is not None

    # 3. Determine Advisory Tier & Safety Guidance
    if has_critical_warning:
        advisory_tier = "CRITICAL_SAFETY_WARNING"
        tier_label = "Safety Warning: Urgent Assistance Required"
        tier_badge = "CRITICAL SAFETY ALERT"
        heading = "Critical Battery Warning — Immediate Action Required"
        advisory_message = (
            "Safety Warning: Your battery data indicates critical thermal stress or active safety alerts. "
            "Do NOT continue driving or fast-charging. Park the vehicle safely in an open outdoor area away "
            "from enclosed structures and request immediate authorized manufacturer roadside assistance."
        )
        evidence_status = "CRITICAL_ALERT"
        evidence_statement = (
            "Severe safety anomaly detected. Immediate authorized technician intervention required."
        )
    elif is_diagnostic_confirmed:
        advisory_tier = "DIAGNOSTIC_CONFIRMED"
        tier_label = "Diagnostic Test Confirmed"
        tier_badge = "CONFIRMED DIAGNOSTIC SCAN"
        heading = "Diagnostic Confirmation Recorded — Verify Options"
        advisory_message = (
            "An authorized service centre diagnostic scan or technician inspection has confirmed battery degradation. "
            "Contact your manufacturer's official customer-care team to verify battery warranty coverage, "
            "service bulletin entitlements, and whether localized module replacement is supported."
        )
        evidence_status = "CONFIRMED_DIAGNOSTIC"
        evidence_statement = (
            "Battery condition is confirmed by diagnostic physical/BMS test results."
        )
    else:
        advisory_tier = "PRELIMINARY_PREDICTION"
        tier_label = "Preliminary AI Estimation"
        tier_badge = "PRELIMINARY AI ESTIMATE"
        heading = "Verify Before You Replace"
        advisory_message = (
            "EVolve AI has identified that replacement may be worth considering based on the available battery data. "
            "Before spending money, contact your vehicle manufacturer's official customer-care team or an "
            "authorized service centre to confirm the diagnosis and determine the appropriate repair."
        )
        evidence_status = "PRELIMINARY_UNCONFIRMED"
        evidence_statement = (
            "Replacement is not yet confirmed. Contact the manufacturer or an authorized service centre for diagnosis."
        )

    # 4. Handle Verified Contact Details vs Safe Fallbacks
    contact_data: dict[str, Any] = {}
    can_call = False
    phone_fallback_message = None

    if manufacturer_identified and match:
        m_status = match.get("verification_status", "UNVERIFIED")
        support_phone = match.get("support_phone")
        support_phone_norm = match.get("support_phone_normalized")
        support_url = match.get("support_url")
        service_locator_url = match.get("service_locator_url")
        source_url = match.get("source_url")
        source_label = match.get(
            "source_label",
            "Contact information sourced from the official manufacturer website",
        )
        verified_at = match.get("verified_at", "2026-10-10T00:00:00Z")
        support_hours = match.get("support_hours")

        # Strict phone validation: only enable calling if VERIFIED and not outdated
        if m_status == "VERIFIED" and support_phone:
            can_call = True
            phone_display = support_phone
            call_link = f"tel:{support_phone_norm or normalize_phone_number(support_phone)}"
        elif m_status == "OUTDATED":
            can_call = False
            phone_display = None
            phone_fallback_message = (
                "Official phone number verification has expired. Visit the manufacturer's "
                "official website to find verified customer support."
            )
            call_link = None
        else:
            can_call = False
            phone_display = None
            phone_fallback_message = (
                "Official phone number unavailable. Visit the manufacturer's official website "
                "to find customer support."
            )
            call_link = None

        contact_data = {
            "manufacturer_id": match.get("manufacturer_id"),
            "manufacturer_name": match.get("manufacturer_name"),
            "country_code": match.get("country_code", resolved_country),
            "country_name": match.get("country_name", "India"),
            "support_phone": phone_display,
            "support_phone_raw": support_phone if can_call else None,
            "support_phone_normalized": support_phone_norm if can_call else None,
            "call_link": call_link,
            "can_call": can_call,
            "phone_fallback_message": phone_fallback_message,
            "support_url": support_url,
            "service_locator_url": service_locator_url,
            "support_hours": support_hours,
            "source_url": source_url,
            "source_label": source_label,
            "verified_at": verified_at,
            "verification_status": m_status,
        }
    else:
        # Manufacturer unknown or country unknown
        phone_fallback_message = (
            "Manufacturer support contact could not be automatically identified from vehicle name. "
            "Please select your vehicle brand and country to display verified official support contacts."
        )
        contact_data = {
            "manufacturer_id": None,
            "manufacturer_name": brand or "Vehicle Manufacturer",
            "country_code": resolved_country,
            "country_name": "India" if resolved_country == "IN" else resolved_country,
            "support_phone": None,
            "support_phone_raw": None,
            "support_phone_normalized": None,
            "call_link": None,
            "can_call": False,
            "phone_fallback_message": phone_fallback_message,
            "support_url": None,
            "service_locator_url": None,
            "support_hours": None,
            "source_url": None,
            "source_label": "Official manufacturer verification",
            "verified_at": None,
            "verification_status": "UNKNOWN",
        }

    return {
        "heading": heading,
        "advisory_tier": advisory_tier,
        "tier_label": tier_label,
        "tier_badge": tier_badge,
        "advisory_message": advisory_message,
        "evidence_status": evidence_status,
        "evidence_statement": evidence_statement,
        "is_preliminary": advisory_tier == "PRELIMINARY_PREDICTION",
        "is_diagnostic_confirmed": is_diagnostic_confirmed,
        "has_critical_warning": has_critical_warning,
        "vehicle_info": {
            "brand": brand,
            "model": model,
            "country_code": resolved_country,
            "country_known": country_known,
            "manufacturer_identified": manufacturer_identified,
        },
        "contact": contact_data,
        "questions_to_ask": QUESTIONS_TO_ASK_MANUFACTURER,
        "warranty_disclaimer": (
            "Do not claim that a recall, warranty entitlement, or repair option exists "
            "unless verified for that particular vehicle and market by an authorized technician."
        ),
        "available_manufacturers": list_supported_manufacturers(
            db=db, country_code=resolved_country
        )
        if not manufacturer_identified or not country_known
        else None,
    }
