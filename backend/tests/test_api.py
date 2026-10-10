"""API surface, error handling, and frontend/backend contract."""

from __future__ import annotations

import io

import pandas as pd
import pytest

from app.data.demo_seed import required_columns, upload_template_frame

#: Every field the React UI reads. If the backend stops serving one, the
#: browser breaks - so these fail in CI before they fail in a demo.
UI_SUMMARY_FIELDS = [
    "total_batteries", "potential_eol_3_months", "potential_eol_6_months",
    "potential_eol_12_months", "intervention_candidates", "collection_pending",
    "second_life_candidates", "recycling_processing_load", "circularity_score",
    "pathway_counts", "lifecycle_counts", "eol_candidates", "anomaly_candidates",
    "capacity_status", "blind_spot_findings", "affected_by_blind_spots",
    "mean_data_confidence",
]

UI_BATTERY_FIELDS = [
    "battery_id", "battery_uid", "vehicle_id", "vehicle_model", "zone", "chemistry",
    "soh_pct", "soh_low_pct", "soh_high_pct", "eol_in_months", "eol_range",
    "anomaly_score", "anomaly_status", "anomaly_wording", "data_confidence",
    "confidence_band", "lifecycle_status", "collection_status", "second_life_status",
    "recycling_status", "trend", "temperature", "data_source", "simulation_notice",
    "pathway", "pathway_label", "latitude", "longitude", "rating_label",
]


# ===========================================================================
# Surface
# ===========================================================================

ENDPOINTS = [
    ("GET", "/api/health"),
    ("GET", "/api/meta"),
    ("GET", "/api/fleet/summary"),
    ("GET", "/api/fleet/vehicles"),
    ("GET", "/api/batteries"),
    ("GET", "/api/waste/forecast"),
    ("GET", "/api/waste/avoidance"),
    ("GET", "/api/collection/prioritize"),
    ("GET", "/api/collection/capacity"),
    ("GET", "/api/circularity/score"),
    ("GET", "/api/traceability/blind-spots"),
    ("GET", "/api/traceability/summary"),
    ("GET", "/api/action-plan"),
    ("GET", "/api/digital-twin/baseline"),
    ("GET", "/api/simulator/scenarios"),
    ("GET", "/api/ml/metrics"),
    ("GET", "/api/ml/verify"),
    ("GET", "/api/ml/robustness"),
    ("GET", "/api/demo/template.csv"),
]


@pytest.mark.parametrize("method,path", ENDPOINTS)
def test_endpoint_returns_200(client, method, path):
    r = client.request(method, path)
    assert r.status_code == 200, f"{method} {path} -> {r.status_code}: {r.text[:200]}"


def test_docs_and_schema_available(client):
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200
    assert client.get("/").json()["app"] == "EVolve AI"


# ===========================================================================
# Detail routes
# ===========================================================================

def test_battery_detail_full_payload(client):
    bid = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    body = client.get(f"/api/batteries/{bid}").json()
    assert body["battery"]["battery_id"] == bid
    assert body["pathway"]["pathway"]
    assert body["pathway"]["rules_fired"]
    assert body["lifecycle"]["battery_lifecycle_id"]


def test_vehicle_detail_and_subroutes(client):
    rows = client.get("/api/fleet/vehicles").json()["batteries"]
    assert rows
    # Every vehicle_id must actually resolve on /api/vehicles/{id}, because the
    # battery list reports them.
    for r in rows[:10]:
        vid = r["vehicle_id"]
        assert client.get(f"/api/vehicles/{vid}").status_code == 200, (
            f"vehicle {vid} appears in the list but 404s on detail"
        )
    vid = rows[0]["vehicle_id"]
    for suffix in ("health", "rul", "anomaly", "lifecycle"):
        r = client.get(f"/api/vehicles/{vid}/{suffix}")
        assert r.status_code == 200, f"/api/vehicles/{vid}/{suffix} -> {r.status_code}"


def test_battery_lifecycle_route(client):
    bid = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    assert client.get(f"/api/batteries/{bid}/lifecycle").status_code == 200


def test_unknown_ids_return_actionable_404s(client):
    for path in ("/api/batteries/NOPE", "/api/vehicles/NOPE", "/api/vehicles/NOPE/health",
                 "/api/vehicles/NOPE/rul", "/api/vehicles/NOPE/anomaly",
                 "/api/vehicles/NOPE/lifecycle", "/api/batteries/NOPE/lifecycle"):
        r = client.get(path)
        assert r.status_code == 404, f"{path} should 404"
        detail = r.json()["detail"]
        assert isinstance(detail, str), f"{path} 404 detail should be a readable string"
        # A useful 404 tells the caller how to find a valid id.
        assert "valid" in detail.lower() and "list" in detail.lower(), (
            f"{path} 404 is not actionable: {detail!r}"
        )


# ===========================================================================
# Filters
# ===========================================================================

def test_pathway_filter(client):
    body = client.get("/api/fleet/vehicles", params={"pathway": "EOL_CANDIDATE"}).json()
    assert body["count"] > 0
    assert all(b["pathway"] == "EOL_CANDIDATE" for b in body["batteries"])


def test_soh_and_eol_filters(client):
    b = client.get("/api/fleet/vehicles", params={"min_soh": 70}).json()
    assert all(x["soh_pct"] >= 70 for x in b["batteries"])
    b2 = client.get("/api/fleet/vehicles", params={"max_eol": 6}).json()
    assert all(
        x["eol_in_months"] is not None and x["eol_in_months"] <= 6 for x in b2["batteries"]
    )


def test_anomaly_confidence_and_search_filters(client):
    a = client.get("/api/fleet/vehicles", params={"anomaly_only": True}).json()
    assert all(x["anomaly_status"] == "POTENTIAL_ANOMALY" for x in a["batteries"])

    c = client.get("/api/fleet/vehicles", params={"confidence_band": "High"}).json()
    assert all(x["confidence_band"] == "High" for x in c["batteries"])

    target = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    s = client.get("/api/fleet/vehicles", params={"search": target}).json()
    assert target in [x["battery_id"] for x in s["batteries"]]


@pytest.mark.parametrize(
    "endpoint", ["/api/fleet/vehicles", "/api/batteries"]
)
@pytest.mark.parametrize(
    "params,check",
    [
        ({"min_soh": 85}, lambda r: r["soh_pct"] >= 85),
        ({"max_soh": 80}, lambda r: r["soh_pct"] <= 80),
        ({"max_eol": 6}, lambda r: r["eol_in_months"] is not None and r["eol_in_months"] <= 6),
        ({"anomaly_only": True}, lambda r: r["anomaly_status"] == "POTENTIAL_ANOMALY"),
        ({"confidence_band": "High"}, lambda r: r["confidence_band"] == "High"),
        ({"pathway": "EOL_CANDIDATE"}, lambda r: r["pathway"] == "EOL_CANDIDATE"),
    ],
)
def test_every_filter_works_on_every_listing_endpoint(client, endpoint, params, check):
    """
    FastAPI silently ignores unknown query parameters, so a listing endpoint that
    forgets a filter looks like a dead control rather than an error. This test
    exists because /api/batteries once accepted only 4 of the 9 filters and the
    UI's SOH / EOL / confidence controls did nothing.
    """
    body = client.get(endpoint, params=params).json()
    rows = body["batteries"]
    if params.get("confidence_band") == "High" and not rows:
        pytest.skip("no high-confidence batteries in this dataset")
    if params.get("pathway") == "EOL_CANDIDATE" and not rows:
        pytest.skip("no EOL candidates in this dataset")
    assert rows, f"{endpoint} with {params} returned nothing - filter may be ignored"
    assert all(check(r) for r in rows), f"{endpoint} ignored {params}"


@pytest.mark.parametrize("endpoint", ["/api/fleet/vehicles", "/api/batteries"])
def test_both_listing_endpoints_agree(client, endpoint):
    """The two listings must not drift apart."""
    a = client.get("/api/fleet/vehicles").json()
    b = client.get("/api/batteries").json()
    assert a["count"] == b["count"]
    assert [x["battery_id"] for x in a["batteries"]] == [
        x["battery_id"] for x in b["batteries"]
    ]


@pytest.mark.parametrize("endpoint", ["/api/fleet/vehicles", "/api/batteries"])
def test_sorting_works_on_every_listing_endpoint(client, endpoint):
    for key in ("soh", "eol", "battery_id"):
        for order in ("asc", "desc"):
            rows = client.get(endpoint, params={"sort_by": key, "order": order}).json()["batteries"]
            get = {
                "soh": lambda r: r["soh_pct"],
                "eol": lambda r: r["eol_in_months"] if r["eol_in_months"] is not None else 1e9,
                "battery_id": lambda r: r["battery_id"],
            }[key]
            vals = [get(r) for r in rows]
            assert vals == sorted(vals, reverse=(order == "desc")), (
                f"{endpoint} sort_by={key} order={order} not applied"
            )


def test_no_match_returns_empty_not_error(client):
    b = client.get("/api/fleet/vehicles", params={"search": "zzz-nothing"}).json()
    assert b["count"] == 0
    assert b["batteries"] == []


@pytest.mark.parametrize("sort_by", ["soh", "eol", "battery_id"])
@pytest.mark.parametrize("order", ["asc", "desc"])
def test_sorting(client, sort_by, order):
    rows = client.get(
        "/api/fleet/vehicles", params={"sort_by": sort_by, "order": order}
    ).json()["batteries"]
    key = {
        "soh": lambda r: r["soh_pct"],
        "eol": lambda r: r["eol_in_months"] if r["eol_in_months"] is not None else 1e9,
        "battery_id": lambda r: r["battery_id"],
    }[sort_by]
    vals = [key(r) for r in rows]
    assert vals == sorted(vals, reverse=(order == "desc"))


def test_combined_filters(client):
    b = client.get(
        "/api/fleet/vehicles",
        params={"pathway": "EOL_CANDIDATE,REPAIR_REFURBISHMENT", "max_soh": 70, "sort_by": "soh"},
    ).json()
    for x in b["batteries"]:
        assert x["pathway"] in ("EOL_CANDIDATE", "REPAIR_REFURBISHMENT")
        assert x["soh_pct"] <= 70


# ===========================================================================
# Contract
# ===========================================================================

def test_summary_has_every_ui_field(client):
    s = client.get("/api/fleet/summary").json()["summary"]
    for f in UI_SUMMARY_FIELDS:
        assert f in s, f"backend no longer serves summary field '{f}'"


def test_battery_payload_has_every_ui_field(client):
    b = client.get("/api/batteries").json()["batteries"][0]
    for f in UI_BATTERY_FIELDS:
        assert f in b, f"backend no longer serves battery field '{f}'"


def test_forecast_has_every_ui_field(client):
    f = client.get("/api/waste/forecast").json()
    for k in ("horizons", "headline", "monthly_forecast", "by_zone", "by_chemistry",
              "totals", "peak_month", "high_risk_zone", "label", "method", "disclaimer"):
        assert k in f, f"forecast missing '{k}'"


def test_ledger_has_every_ui_field(client):
    l = client.get("/api/waste/avoidance").json()
    for k in ("counts", "total_batteries", "retained_batteries",
              "potential_intervention_candidates", "potential_eol_candidates",
              "potential_eol_waste_avoided_units", "prevention_ratio_pct",
              "method", "label", "disclaimer"):
        assert k in l


def test_circularity_has_tooltip_ready_explanation(client):
    c = client.get("/api/circularity/score").json()
    for comp in c["components"]:
        for k in ("name", "label", "weight", "raw_pct", "points", "explainer"):
            assert k in comp


def test_queue_and_batch_payloads(client):
    q = client.get("/api/collection/prioritize").json()
    for k in ("queue", "by_band", "weights", "method", "label", "total"):
        assert k in q
    item = q["queue"][0]
    for k in ("battery_id", "priority_score", "priority_band", "factors", "reconciliation",
              "collection_deadline", "days_to_deadline", "wording"):
        assert k in item

    b = client.post("/api/collection/batch", json={}).json()
    for k in ("batches", "total_batches", "total_units", "unscheduled",
              "distance_saved_vs_solo_km", "method", "cost_basis_inr"):
        assert k in b


def test_action_plan_payload(client):
    p = client.get("/api/action-plan").json()
    assert len(p["horizons"]) == 3
    for h in p["horizons"]:
        assert h["horizon"] in ("IMMEDIATE", "NEXT_30_DAYS", "NEXT_6_MONTHS")
        assert h["count"] == len(h["items"])


def test_twin_and_scenario_payloads(client):
    t = client.get("/api/digital-twin/baseline").json()
    for k in ("results", "monthly_forecast", "pathway_counts", "scenarios"):
        assert k in t
    s = client.post("/api/simulator/run", json={"fleet_scale": 1.3}).json()
    for k in ("params", "results", "baseline", "delta", "method", "limitations"):
        assert k in s
    assert client.get("/api/simulator/scenarios").json()["scenarios"]


def test_explain_payload(client):
    bid = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    e = client.post("/api/reports/explain", json={"battery_id": bid}).json()
    for k in ("explanation", "source", "genai_key_configured", "grounded_in",
              "facts_used", "note", "disclaimer"):
        assert k in e


# ===========================================================================
# POST endpoints
# ===========================================================================

def test_demo_load_is_idempotent(client):
    for _ in range(2):
        r = client.post("/api/demo/load", json={"count": 40, "reset": True})
        assert r.status_code == 200
        assert r.json()["batteries"] == 40
        assert client.get("/api/health").json()["batteries"] == 40
    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_demo_load_validates_bounds(client):
    assert client.post("/api/demo/load", json={"count": 2}).status_code == 422
    assert client.post("/api/demo/load", json={"count": 9999}).status_code == 422


def test_demo_load_works_without_a_body(client):
    r = client.post("/api/demo/load")
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.json()["status"] == "loaded"
    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_prevention_post_returns_fleet_and_single(client):
    fleet = client.post("/api/waste/prevention", json={}).json()
    assert fleet["fleet"] and fleet["ledger"]
    assert "prevention_principle" in fleet

    bid = fleet["fleet"][0]["battery_id"]
    one = client.post("/api/waste/prevention", json={"battery_id": bid}).json()
    assert one["decision"]["battery_id"] == bid


def test_prevention_unknown_battery_is_404(client):
    assert client.post("/api/waste/prevention", json={"battery_id": "NOPE"}).status_code == 404


def test_record_intervention_writes_to_the_audit_trail(client):
    bid = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    r = client.post(
        f"/api/waste/intervention/{bid}",
        json={"pathway": "SECOND_LIFE_ASSESSMENT", "decided_by": "tester"},
    )
    assert r.status_code == 200
    tl = client.get(f"/api/batteries/{bid}/lifecycle").json()
    assert any(e["event"] == "INTERVENTION_ASSESSMENT" for e in tl["events"])


def test_simulator_validates_bounds(client):
    assert client.post("/api/simulator/run", json={"fleet_scale": 0}).status_code == 422
    assert client.post("/api/simulator/run", json={"fleet_scale": 99}).status_code == 422
    assert client.post("/api/simulator/run", json={"intervention_rate": 5}).status_code == 422


def test_batch_validates_bounds(client):
    assert client.post("/api/collection/batch", json={"trip_capacity_units": 0}).status_code == 422
    assert client.post("/api/collection/batch", json={"trips_per_month": -1}).status_code == 422


# ===========================================================================
# Error handling
# ===========================================================================

def test_empty_database_returns_an_actionable_409(client):
    client.post("/api/demo/load", json={"count": 10, "reset": True})
    # Force an empty state directly, since the loader always seeds.
    from app.database.base import session_scope
    from app.database.models import Battery

    with session_scope() as db:
        db.query(Battery).delete()

    from app.services import fleet as fleet_mod

    fleet_mod.invalidate()
    r = client.get("/api/fleet/summary")
    assert r.status_code == 409
    assert "Load Demo Fleet" in r.json()["detail"]

    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_upload_valid_csv(client):
    csv = upload_template_frame().to_csv(index=False).encode()
    r = client.post("/api/data/upload", files={"file": ("f.csv", csv, "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rows_imported"] == 12
    assert body["provenance"]["simulated"] is False
    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_upload_rejects_missing_columns(client):
    r = client.post("/api/data/upload", files={"file": ("b.csv", b"a,b\n1,2\n", "text/csv")})
    assert r.status_code == 422
    d = r.json()["detail"]
    assert d["error"] == "missing required columns"
    assert d["required"] == required_columns()
    assert "template.csv" in d["hint"]


def test_upload_rejects_empty_and_header_only(client):
    assert client.post("/api/data/upload", files={"file": ("e.csv", b"", "text/csv")}).status_code == 400
    header = ",".join(required_columns()).encode()
    assert client.post("/api/data/upload", files={"file": ("h.csv", header, "text/csv")}).status_code == 400


def test_upload_rejects_unparseable_csv(client):
    r = client.post("/api/data/upload", files={"file": ("x.csv", b"\x00\x01\x02", "text/csv")})
    assert r.status_code in (400, 422)


def test_upload_drops_bad_numeric_rows_but_keeps_the_rest(client):
    df = upload_template_frame()
    df.loc[0, "daily_km"] = "n/a"
    r = client.post("/api/data/upload", files={"file": ("f.csv", df.to_csv(index=False).encode(), "text/csv")})
    assert r.status_code == 200
    assert r.json()["rows_imported"] == 11
    assert r.json()["rows_dropped_unparseable"]
    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_template_csv_downloads_and_validates(client):
    r = client.get("/api/demo/template.csv")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    df = pd.read_csv(io.StringIO(r.text))
    for c in required_columns():
        assert c in df.columns
    # and it round-trips
    up = client.post("/api/data/upload", files={"file": ("t.csv", r.content, "text/csv")})
    assert up.status_code == 200
    client.post("/api/demo/load", json={"count": 75, "reset": True})


# ===========================================================================
# Export
# ===========================================================================

def test_export_csv_is_valid_and_labelled(client):
    r = client.get("/api/reports/fleet.csv")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    df = pd.read_csv(io.StringIO(r.text))
    assert len(df) == client.get("/api/health").json()["batteries"]
    for col in ("DATA_PROVENANCE", "battery_id", "soh_pct", "estimated_eol_months",
                "pathway", "rules_fired", "anomaly_status", "data_confidence",
                "lifecycle_status", "potential_avoided_units"):
        assert col in df.columns


def test_export_respects_filters(client):
    df = pd.read_csv(io.StringIO(client.get(
        "/api/reports/fleet.csv", params={"pathway": "EOL_CANDIDATE"}).text))
    assert set(df["pathway"]) == {"EOL_CANDIDATE"}


def test_export_with_no_matches_still_has_a_header(client):
    """
    The export endpoint takes risk/pathway filters, not SOH. Use a filter that
    cannot match anything, then confirm the file is still parseable.
    """
    df = pd.read_csv(io.StringIO(client.get(
        "/api/reports/fleet.csv", params={"pathway": "NOT_A_REAL_PATHWAY"}
    ).text))
    assert len(df) == 0, "an unknown pathway should match nothing"
    assert "battery_id" in df.columns, "empty export must still carry a header row"


def test_queries_do_not_mutate_the_dataset(client):
    before = client.get("/api/health").json()["batteries"]
    client.get("/api/reports/fleet.csv")
    client.get("/api/collection/prioritize")
    assert client.get("/api/health").json()["batteries"] == before