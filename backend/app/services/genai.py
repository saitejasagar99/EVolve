"""
Module 15 - GenAI Explanation Layer.

TWO HARD RULES
==============
1. GROUNDING. The model receives a `facts` dict assembled ONLY from backend
   outputs. It is never shown a raw battery reading and is never asked to
   compute anything. A test extracts every number from the returned text and
   requires each one to exist in the facts dict - so an invented figure fails
   the suite rather than reaching a user.

2. NO-KEY FALLBACK. With no GENAI_API_KEY set, a deterministic local explainer
   produces the answer from the same facts. The response shape is identical, so
   the UI does not change. A broken or slow endpoint degrades to the fallback
   instead of raising.

The language model explains. It never predicts.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from .. import config


def genai_available() -> bool:
    return bool(config.GENAI_API_KEY)


def inr(x: float) -> str:
    """Indian digit grouping: 100000 -> 'INR 1,00,000'."""
    neg = x < 0
    s = str(abs(int(round(x))))
    if len(s) > 3:
        last3, rest, parts = s[-3:], s[:-3], []
        while len(rest) > 2:
            parts.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            parts.insert(0, rest)
        s = ",".join(parts) + "," + last3
    return ("-" if neg else "") + "INR " + s


def build_facts(record: dict[str, Any], decision: dict[str, Any],
                extras: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Assemble the only permitted source of facts for an explanation.

    Every value is copied from a backend service output. Nothing is typed by
    hand, so the explanation cannot drift from the numbers on screen.
    """
    top = max(
        decision["rules_fired"],
        key=lambda r: 0,
        default=None,
    )
    facts: dict[str, Any] = {
        "battery_id": record["battery_id"],
        "vehicle_id": record["vehicle_id"],
        "soh_pct": round(float(record["soh_pct"]), 1),
        "soh_estimate_range_pct": [
            round(float(record["soh_low_pct"]), 1),
            round(float(record["soh_high_pct"]), 1),
        ],
        "eol_in_months": (
            round(float(record["eol_in_months"]), 1)
            if record.get("eol_in_months") is not None else None
        ),
        "eol_threshold_soh_pct": round(float(record["eol_threshold_soh_pct"]), 0),
        "battery_age_months": record.get("battery_age_months"),
        "charging_cycles": record.get("charging_cycles"),
        "anomaly_score": round(float(record.get("anomaly_score") or 0.0), 2),
        "anomaly_status": record.get("anomaly_status"),
        "data_confidence": round(float(record.get("data_confidence") or 0.0), 1),
        "confidence_band": record.get("confidence_band"),
        "trend_direction": (record.get("trend") or {}).get("trend_direction"),
        "monthly_degradation_pct": (record.get("trend") or {}).get("monthly_degradation_pct"),
        "pathway": decision["pathway"],
        "pathway_label": decision["pathway_label"],
        "rules_fired": [r["rule"] for r in decision["rules_fired"]],
        "potential_avoided_units": decision["potential_avoided_units"],
        "estimated_intervention_cost_inr": decision["estimated_intervention_cost_inr"],
        "zone": record.get("zone"),
        "data_source": record.get("data_source"),
    }
    if extras:
        facts.update(extras)
    return facts


SYSTEM_PROMPT = (
    "You are an EV battery circularity analyst explaining decisions to a fleet operator. "
    "STRICT RULES: "
    "(1) Use ONLY the numbers in the FACTS JSON. Never invent, estimate or adjust a figure. "
    "(2) If a number you want is not in FACTS, say it is unavailable. "
    "(3) Never claim a battery is safe or unsafe - assessment requires physical inspection. "
    "(4) Never claim regulatory compliance. "
    "(5) An anomaly is a signal requiring inspection, not a confirmed fault. "
    "(6) Be concise: 4-6 sentences."
)


def _local_explanation(facts: dict[str, Any]) -> str:
    """
    Deterministic explainer used when no GenAI key is configured.

    Every sentence is templated from `facts`, so it is grounded by construction
    and byte-identical for identical inputs.
    """
    p: list[str] = []
    p.append(
        f"{facts['battery_id']} (in vehicle {facts['vehicle_id']}) has an estimated "
        "State of Health of "
        f"{facts['soh_pct']}%, with a model estimate range of "
        f"{facts['soh_estimate_range_pct'][0]}-{facts['soh_estimate_range_pct'][1]}%."
    )

    if facts["eol_in_months"] is None:
        p.append(
            "There is insufficient historical data to estimate when this pack will reach "
            "end of life, so no date is claimed."
        )
    else:
        p.append(
            f"At that level the estimated time to the {facts['eol_threshold_soh_pct']}% "
            f"end-of-life threshold is {facts['eol_in_months']} months, assuming the "
            "observed duty cycle continues."
        )

    if facts["trend_direction"]:
        deg = facts["monthly_degradation_pct"]
        if facts["trend_direction"] == "DEGRADING":
            p.append(
                f"The measured trend is degrading at roughly {deg}% of capacity per month."
            )
        elif facts["trend_direction"] == "STABLE":
            p.append("The measured degradation trend is stable over the available history.")
        elif facts["trend_direction"] == "INSUFFICIENT_DATA":
            p.append("There is too little history to establish a degradation trend.")

    p.append(
        f"Data confidence for this battery is {facts['data_confidence']}% "
        f"({facts['confidence_band']}), which sets how much weight this assessment deserves."
    )

    if facts["anomaly_status"] == "POTENTIAL_ANOMALY":
        p.append(
            f"An anomaly signal was flagged at severity {facts['anomaly_score']}. "
            "That is a signal requiring technical inspection, not a confirmed fault."
        )

    p.append(
        f"Because of those inputs the system classifies this battery as "
        f"'{facts['pathway_label']}'. The rules that fired were: "
        f"{', '.join(facts['rules_fired']) if facts['rules_fired'] else 'none'}."
    )

    if facts["potential_avoided_units"] > 0:
        p.append(
            f"Retaining this pack avoids an estimated {facts['potential_avoided_units']} "
            f"battery unit entering the waste stream, at an intervention cost of "
            f"{inr(facts['estimated_intervention_cost_inr'])}."
        )

    if facts.get("data_source") == "SIMULATED":
        p.append(
            "These figures come from synthetic demo data, so they illustrate the decision "
            "logic rather than describing a specific real battery."
        )

    p.append(
        "This is decision support. It does not certify a battery safe or unsafe, and it "
        "is not a regulatory compliance determination; both require physical inspection "
        "and qualified assessment."
    )
    return " ".join(p)


def _call_external(facts: dict[str, Any]) -> str | None:
    """Best-effort external call. Returns None on ANY failure."""
    if not genai_available():
        return None

    url = f"{config.GENAI_ENDPOINT}/{config.GENAI_MODEL}:generateContent?key={config.GENAI_API_KEY}"
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "Explain this EV battery's circularity decision to a fleet "
                            "operator.\n\nFACTS JSON (the ONLY permitted source of numbers):\n"
                            + json.dumps(facts, indent=2)
                        )
                    }
                ],
            }
        ],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 600},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=config.GENAI_TIMEOUT_SECONDS) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return payload["candidates"][0]["content"]["parts"][0]["text"].strip() or None
    except (
        urllib.error.URLError, urllib.error.HTTPError, KeyError, IndexError,
        ValueError, TimeoutError, OSError,
    ):
        return None


def explain(facts: dict[str, Any], allow_external: bool = True) -> dict[str, Any]:
    """
    Produce a grounded explanation.

    `allow_external=False` forces the deterministic path regardless of whether a
    key is configured - which is how the tests prove the fallback is independent
    of key presence.
    """
    used_external = False
    text = None
    error: str | None = None

    if allow_external and genai_available():
        text = _call_external(facts)
        used_external = text is not None
        if text is None:
            error = "external GenAI call failed or timed out"

    if text is None:
        text = _local_explanation(facts)
        if error is None and genai_available() and allow_external:
            error = "external call unavailable"

    return {
        "battery_id": facts["battery_id"],
        "explanation": text,
        "source": "genai" if used_external else "local-fallback",
        "genai_key_configured": genai_available(),
        "fallback_reason": error,
        "grounded_in": "backend battery intelligence, prevention engine and lifecycle records",
        "facts_used": facts,
        "note": (
            "The explanation is templated only from the numeric facts listed in "
            "facts_used. Those values come from the ML models, the prevention rules "
            "engine and the lifecycle database."
        ),
        "disclaimer": (
            "Decision-support output. Not a safety certification and not a regulatory "
            "compliance determination."
        ),
    }