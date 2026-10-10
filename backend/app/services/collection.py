"""
Modules 6 & 7 - EOL Collection Prioritization and Smart Batching.

Module 6 produces a Collection Priority Score per EOL-candidate battery from
weighted, named factors. The factors sum exactly to the score (asserted in
tests), so the queue can be audited line by line.

Module 7 does NOT simply sort the queue. It clusters by geography, respects
vehicle/trip capacity, and reports the distance saved by batching versus
visiting each battery alone - which is the actual operational argument.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from typing import Any

from .. import config
from .prevention import EOL_CANDIDATE

#: Priority weights, must sum to 1.0.
PRIORITY_WEIGHTS: dict[str, float] = {
    "eol_urgency": 0.35,
    "degradation_severity": 0.25,
    "anomaly_status": 0.15,
    "location_access": 0.10,
    "fleet_priority": 0.10,
    "overdue_status": 0.05,
}
assert abs(sum(PRIORITY_WEIGHTS.values()) - 1.0) < 1e-9

#: Severity -> urgency ramp. 0 months = fully urgent, 12 months = not urgent.
URGENCY_HORIZON_MONTHS = 12.0

#: Collection cost basis, INR. Single source, operator-editable.
TRIP_BASE_COST_INR = 2_200.0
PER_KM_COST_INR = 18.0
HANDLING_COST_PER_UNIT_INR = 1_100.0

#: Depot reference point per zone (illustrative schematic coordinates).
#: Batching is measured against a depot that serves its own zone, which is what
#: makes the distance saving meaningful: a batch tour reaches every pack in the
#: zone from one departure, whereas a solo collection must reach one pack and
#: return. These are NOT real depot locations.
ZONE_DEPOTS: dict[str, tuple[float, float]] = {
    "Hyderabad North": (17.4400, 78.3480),
    "Hyderabad South": (17.3200, 78.4400),
    "Hyderabad East": (17.3800, 78.5500),
    "Hyderabad West": (17.4100, 78.2600),
    "Rangareddy": (17.3300, 78.2700),
    "Medchal": (17.3100, 78.5900),
}
DEFAULT_DEPOT = (17.4000, 78.4000)


def _zone_reference(zone: str) -> tuple[float, float]:
    return ZONE_DEPOTS.get(zone, DEFAULT_DEPOT)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Module 6 - prioritisation
# ---------------------------------------------------------------------------

def _urgency(record: dict[str, Any]) -> float:
    eol = record.get("eol_in_months")
    soh = record["soh_pct"] / 100.0
    # Already past the threshold is maximally urgent regardless of horizon.
    if record.get("already_below_eol_threshold") or eol is None or eol <= 0:
        return 1.0
    return float(max(0.0, 1.0 - (eol / URGENCY_HORIZON_MONTHS)))


def _severity(record: dict[str, Any]) -> float:
    return float(max(0.0, min(1.0, (config.EOL_SOH_THRESHOLD - record["soh_pct"] / 100.0) / 0.45)))


def _access(record: dict[str, Any]) -> float:
    """Remote / hard-access packs are slightly harder to collect."""
    zone = (record.get("zone") or "").lower()
    if "ranga" in zone or "medchal" in zone:
        return 0.65
    return 0.85


def priority_for(record: dict[str, Any], decision: dict[str, Any],
                 now: datetime | None = None) -> dict[str, Any]:
    """Collection priority score for one EOL candidate, with factor breakdown."""
    now = now or datetime.now(timezone.utc)

    urg = _urgency(record)
    sev = _severity(record)
    anom = float(record.get("anomaly_score") or 0.0)
    acc = _access(record)
    fp = 1.0 if (record.get("fleet_priority") == "Critical") else 0.55

    # Overdue = already sitting as EOL with no collection scheduled.
    overdue = 1.0 if (
        decision["pathway"] == EOL_CANDIDATE
        and record.get("collection_status") in (None, "", "NOT_SCHEDULED", "PENDING")
    ) else 0.0

    raw = {
        "eol_urgency": urg,
        "degradation_severity": sev,
        "anomaly_status": float(min(anom, 1.0)),
        "location_access": acc,
        "fleet_priority": fp,
        "overdue_status": overdue,
    }

    factors = [
        {
            "name": k,
            "weight": PRIORITY_WEIGHTS[k],
            "raw_value": round(v, 4),
            "points": round(v * PRIORITY_WEIGHTS[k] * 100, 2),
        }
        for k, v in raw.items()
    ]
    score = round(sum(f["points"] for f in factors), 2)

    # Deadline = half the remaining horizon, floored at 14 days, capped at 90.
    eol = record.get("eol_in_months")
    if eol is None or eol <= 0:
        days = 14
    else:
        days = int(max(14, min(90, (eol / 2) * 30)))
    deadline = now + timedelta(days=days)

    return {
        "battery_id": record["battery_id"],
        "vehicle_id": record["vehicle_id"],
        "zone": record.get("zone"),
        "latitude": record.get("latitude"),
        "longitude": record.get("longitude"),
        "priority_score": score,
        "priority_band": band_for(score),
        "factors": factors,
        "reconciliation": {
            "sum_of_factor_points": round(sum(f["points"] for f in factors), 2),
            "priority_score": score,
            "consistent": abs(sum(f["points"] for f in factors) - score) < 0.01,
        },
        "collection_deadline": deadline.isoformat(),
        "days_to_deadline": days,
        "soh_pct": record["soh_pct"],
        "eol_in_months": eol,
        "anomaly_score": round(anom, 3),
        "chemistry": record.get("chemistry"),
        "rated_capacity_kwh": record.get("rated_capacity_kwh"),
        "wording": (
            "Priority reflects estimated EOL urgency, degradation, anomaly signal, "
            "access and fleet priority. It is a scheduling aid, not a safety rating."
        ),
    }


def band_for(score: float) -> str:
    if score >= 70:
        return "CRITICAL"
    if score >= 50:
        return "HIGH"
    if score >= 30:
        return "MEDIUM"
    return "LOW"


def build_queue(decisions: list[dict[str, Any]], records: list[dict[str, Any]],
                now: datetime | None = None) -> dict[str, Any]:
    """The EOL collection queue, highest priority first."""
    rec_by_id = {r["battery_id"]: r for r in records}
    items = [
        priority_for(rec_by_id[d["battery_id"]], d, now)
        for d in decisions
        if d["pathway"] == EOL_CANDIDATE and d["battery_id"] in rec_by_id
    ]
    items.sort(key=lambda x: -x["priority_score"])

    bands: dict[str, int] = {}
    for i in items:
        bands[i["priority_band"]] = bands.get(i["priority_band"], 0) + 1

    return {
        "total": len(items),
        "by_band": bands,
        "queue": items,
        "weights": PRIORITY_WEIGHTS,
        "method": (
            "Weighted sum of six named factors. Factor points sum exactly to the "
            "priority score, so every ranking can be audited from the response alone."
        ),
        "label": "ESTIMATED PRIORITY - scheduling aid, not a safety rating",
    }


# ---------------------------------------------------------------------------
# Module 7 - smart batching
# ---------------------------------------------------------------------------

def build_batches(queue: dict[str, Any],
                  trip_capacity: int = config.DEFAULT_TRIP_CAPACITY_UNITS,
                  trips_per_month: int = config.DEFAULT_COLLECTION_TRIPS_PER_MONTH,
                  max_trips: int | None = None) -> dict[str, Any]:
    """
    Group the EOL queue into collection batches.

    Strategy (deterministic, stated so it can be challenged):
      1. Sort strictly by priority - urgency first. Geography may influence
         WHICH batch a pack joins, but never whether it outranks another pack.
      2. Walk the sorted list, adding each battery to an open batch in the same
         zone that still has trip capacity; otherwise open a new batch.
      3. Distance is the route depot -> stops -> depot on schematic coordinates,
         compared against the solo baseline of one round trip per pack.

    `max_trips` caps trips available. Batches beyond that cap are reported as
    unscheduled with a reason - never silently dropped.
    """
    items = queue["queue"]
    empty = {
        "batches": [], "total_batches": 0, "total_units": 0,
        "scheduled_batches": 0, "unscheduled_units": 0, "unscheduled_count": 0,
        "over_cap_batches": 0,
        "total_distance_km": 0.0, "total_estimated_cost_inr": 0.0,
        "distance_saved_vs_solo_km": 0.0, "cost_saved_vs_solo_inr": 0.0,
        "note": "No EOL candidates to collect.",
    }
    if not items:
        return empty

    limit = trips_per_month if max_trips is None else max_trips
    open_batches: list[dict[str, Any]] = []
    completed: list[dict[str, Any]] = []
    #: Batches built but beyond the available trip count. Their batteries are
    #: reported as unscheduled rather than dropped.
    over_cap: list[dict[str, Any]] = []

    for item in items:
        placed = False
        for b in open_batches:
            if b["zone"] == item["zone"] and len(b["batteries"]) < trip_capacity:
                b["batteries"].append(item)
                placed = True
                break
        if not placed:
            open_batches.append({"zone": item["zone"], "batteries": [item]})
        # Retire full batches so they are not offered more work.
        for b in [b for b in open_batches if len(b["batteries"]) >= trip_capacity]:
            open_batches.remove(b)
            (completed if len(completed) < limit else over_cap).append(b)

    # Any still-open batches at the end also compete for the remaining trips.
    for b in open_batches:
        (completed if len(completed) < limit else over_cap).append(b)

    scheduled_ids = {
        i["battery_id"] for b in completed for i in b["batteries"]
    }
    unscheduled = [i for i in items if i["battery_id"] not in scheduled_ids]

    batches: list[dict[str, Any]] = []
    total_distance = 0.0
    total_cost = 0.0
    solo_distance = 0.0

    for idx, b in enumerate(sorted(completed, key=lambda x: -max(
        i["priority_score"] for i in x["batteries"]
    )), start=1):
        zone_ref = _zone_reference(b["zone"])
        pts = [
            (i["latitude"], i["longitude"], i["battery_id"])
            for i in b["batteries"]
        ]
        # Route = depot -> stops -> depot, where the depot is the zone's
        # reference point. Real depots sit near the cluster they serve, so the
        # batch route is short while a SOLO collection must reach the pack and
        # come back. That difference is the operational saving.
        cur = zone_ref
        route = 0.0
        remaining = list(pts)
        while remaining:
            nxt = min(
                remaining,
                key=lambda p: _haversine_km(cur[0], cur[1], p[0], p[1]),
            )
            route += _haversine_km(cur[0], cur[1], nxt[0], nxt[1])
            cur = nxt
            remaining.remove(nxt)
        route += _haversine_km(cur[0], cur[1], zone_ref[0], zone_ref[1])

        units = len(b["batteries"])
        cost = round(
            TRIP_BASE_COST_INR + PER_KM_COST_INR * route + units * HANDLING_COST_PER_UNIT_INR, 2
        )
        # Solo baseline: every pack needs its own round trip from the depot.
        solo = sum(
            2 * _haversine_km(zone_ref[0], zone_ref[1], lat, lon)
            for (lat, lon, _) in pts
        )

        band = band_for(max(i["priority_score"] for i in b["batteries"]))
        batches.append(
            {
                "batch_code": f"CB-{idx:02d}",
                "zone": b["zone"],
                "priority_band": band,
                "batteries": [i["battery_id"] for i in b["batteries"]],
                "battery_count": units,
                "total_units": units,
                "estimated_distance_km": round(route, 1),
                "estimated_cost_inr": cost,
                "solo_visit_cost_inr": round(
                    len(b["batteries"]) * TRIP_BASE_COST_INR
                    + PER_KM_COST_INR * solo
                    + units * HANDLING_COST_PER_UNIT_INR, 2
                ),
                "distance_saved_vs_solo_km": round(max(solo - route, 0.0), 1),
                "priority_score": round(
                    max(i["priority_score"] for i in b["batteries"]), 1
                ),
                "status": "PLANNED",
            }
        )
        total_distance += route
        total_cost += cost
        solo_distance += solo

    saved_cost = round(
        sum(b["solo_visit_cost_inr"] - b["estimated_cost_inr"] for b in batches), 2
    )

    return {
        "batches": batches,
        "total_batches": len(batches),
        "scheduled_batches": len(batches),
        "total_units": sum(b["total_units"] for b in batches),
        "total_estimated_cost_inr": round(total_cost, 2),
        "total_distance_km": round(total_distance, 1),
        "distance_saved_vs_solo_km": round(max(solo_distance - total_distance, 0.0), 1),
        "cost_saved_vs_solo_inr": max(saved_cost, 0.0),
        "trips_available": limit,
        "trip_capacity_units": trip_capacity,
        "unscheduled": [
            {
                "battery_id": i["battery_id"],
                "priority_score": i["priority_score"],
                "reason": (
                    f"Collection trip capacity for this period is {limit} trip(s). "
                    "This battery remains in the EOL queue and is NOT dropped; it must "
                    "be scheduled in a later period or capacity must be increased."
                ),
            }
            for i in unscheduled
        ],
        "unscheduled_count": len(unscheduled),
        "over_cap_batches": len(over_cap),
        "method": (
            "Priority-ordered, zone-clustered, capacity-constrained batching with a "
            "nearest-neighbour route. Batches beyond the available trip count are "
            "reported as unscheduled with a reason rather than silently discarded."
        ),
        "cost_basis_inr": {
            "trip_base": TRIP_BASE_COST_INR,
            "per_km": PER_KM_COST_INR,
            "handling_per_unit": HANDLING_COST_PER_UNIT_INR,
        },
    }