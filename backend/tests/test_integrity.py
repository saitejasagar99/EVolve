"""
Integrity checks that apply across every module.

These are the tests a national-level jury would probe:
  1. are predictions real or hardcoded?
  2. is demo data labelled synthetic?
  3. are SOH/EOL claims supported, with baselines and stated limits?
  4. does every score reconcile with the explanation of it?
  6. do capacity/budget scenarios never overspend?
  8. is GenAI grounded in backend numbers?
  9. does the fallback work with no API key?
 12. does it work with no external services?
"""

from __future__ import annotations

import json
import re

import numpy as np
import pandas as pd
import pytest

from app.data.demo_seed import SIM_NOTICE, required_columns
from app.ml.trainer import (
    FEATURE_COLUMNS,
    ModelBundle,
    load_metrics,
    robustness_ablation,
    verify_not_hardcoded,
)


# ===========================================================================
# CHECK 1 - predictions are real, not hardcoded
# ===========================================================================

def test_models_are_fitted_sklearn_estimators():
    b = ModelBundle()
    assert b.ready
    for m in (b.soh, b.eol):
        assert hasattr(m, "predict")
        assert len(getattr(m, "estimators_", [])) > 0
    assert hasattr(b.anomaly, "predict")


def test_no_vehicle_or_battery_literals_in_ml_source():
    import inspect

    from app.ml import trainer

    src = inspect.getsource(trainer)
    assert "EV-0" not in src
    assert "BAT-0" not in src, "trainer.py contains battery-id literals - possible hardcoding"


def test_predictions_respond_to_inputs():
    result = verify_not_hardcoded()
    assert result["directionally_correct"], result["verdict"]
    assert result["verdict"].startswith("PASS"), result["verdict"]


def test_more_cycling_reduces_soh_monotonically():
    from app.ml.trainer import make_feature_frame
    from app.data.demo_seed import build_battery_specs

    b = ModelBundle()
    base = make_feature_frame(build_battery_specs(1))
    frames = []
    for e in (200.0, 500.0, 800.0, 1100.0, 1400.0, 1700.0, 2000.0):
        f = base.copy()
        f["equivalent_full_cycles"] = e
        frames.append(f)
    preds = b.predict(pd.concat(frames, ignore_index=True))["soh"]
    assert np.all(np.diff(preds) < 0), f"SOH not monotonic: {preds}"


def test_predictions_are_deterministic():
    from app.ml.trainer import make_feature_frame
    from app.data.demo_seed import build_battery_specs

    b = ModelBundle()
    df = make_feature_frame(build_battery_specs(6))
    assert np.allclose(b.predict(df)["soh"], b.predict(df)["soh"])
    assert np.allclose(b.predict(df)["eol"], b.predict(df)["eol"])


def test_predictions_vary_across_assets():
    from app.ml.trainer import make_feature_frame
    from app.data.demo_seed import build_battery_specs

    b = ModelBundle()
    out = b.predict(make_feature_frame(build_battery_specs(30)))
    assert len(np.unique(np.round(out["soh"], 5))) > 20


def test_no_target_leakage_in_features():
    for bad in ("true_soh", "true_eol_months", "_anomaly"):
        assert bad not in FEATURE_COLUMNS, f"{bad} leaked into FEATURE_COLUMNS"


# ===========================================================================
# CHECK 2 - synthetic data is labelled
# ===========================================================================

def test_health_declares_synthetic_provenance(client):
    body = client.get("/api/health").json()
    assert body["provenance"]["simulated"] is True
    assert body["provenance"]["label"] == "SYNTHETIC DEMO DATA"


def test_every_battery_is_flagged_simulated(client):
    rows = client.get("/api/fleet/vehicles").json()["batteries"]
    assert rows
    for r in rows:
        assert r["data_source"] == "SIMULATED", f"{r['battery_id']} not flagged"


def test_meta_carries_the_safety_disclaimer(client):
    body = client.get("/api/meta").json()
    d = body["disclaimer"].lower()
    assert "decision-support" in d
    assert "not replace certified technical inspection" in d
    assert "regulatory compliance" in d
    r = body["responsibility_statement"].lower()
    assert "does not certify" in r
    assert "regulatory" in r
    # Forbidden claims must be absent from the whole meta payload.
    blob = json.dumps(body).lower()
    for banned in ("cpcb compliant", "officially compliant", "certified safe",
                   "guaranteed rul", "first system"):
        assert banned not in blob, f"meta payload contains forbidden claim {banned!r}"


def test_export_carries_provenance_column(client):
    r = client.get("/api/reports/fleet.csv")
    assert r.status_code == 200
    first = r.text.splitlines()[0]
    assert "DATA_PROVENANCE" in first
    assert "SYNTHETIC" in r.text
    assert "SYNTHETIC" in r.headers["content-disposition"]


def test_simulation_notice_is_explicit():
    assert "synthetic" in SIM_NOTICE.lower()
    assert "not measured battery data" in SIM_NOTICE.lower()


def test_upload_flips_provenance_everywhere(client):
    import io

    from app.data.demo_seed import upload_template_frame

    csv = upload_template_frame().to_csv(index=False).encode()
    r = client.post("/api/data/upload", files={"file": ("mine.csv", csv, "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["provenance"]["simulated"] is False
    assert body["provenance"]["label"] == "OPERATOR-UPLOADED DATA"
    assert "unvalidated transfer" in body["warning"]

    # restored on reset
    client.post("/api/demo/load", json={"count": 75, "reset": True})
    assert client.get("/api/health").json()["provenance"]["simulated"] is True


# ===========================================================================
# CHECK 3 - claims are supported by data, with baselines and limits
# ===========================================================================

def test_metrics_are_computed_with_a_baseline():
    m = load_metrics()
    assert m.get("status") != "untrained"
    for block in ("soh", "eol"):
        for f in ("mae", "rmse", "r2", "baseline_mae", "baseline_r2", "skill_vs_baseline_pct"):
            assert f in m[block], f"{block} metrics missing {f}"
        assert m[block]["baseline_r2"] == 0.0
        assert m[block]["skill_vs_baseline_pct"] > 0, f"{block} does not beat the baseline"


def test_anomaly_metrics_report_positive_case_count():
    a = load_metrics()["anomaly"]
    assert a["n_positive_cases"] >= 30, (
        f"anomaly metrics rest on {a['n_positive_cases']} positives - not meaningful"
    )
    assert a["f1"] > 0.5, f"anomaly F1 is only {a['f1']}"


def test_metrics_state_their_own_limitations():
    m = load_metrics()
    assert len(m["limitations"]) >= 8
    joined = " ".join(m["limitations"]).lower()
    assert "synthetic" in joined
    assert "not" in joined
    assert m["honesty"]["headline"]


def test_high_r2_is_disclosed_as_a_data_generation_artifact():
    m = load_metrics()
    why = m["honesty"]["why_soh_r2_is_so_high"].lower()
    assert "deterministic" in why or "data-generating" in why
    assert "not evidence" in why or "property of the data" in why
    assert "real-world" in why
    assert "artifact" in " ".join(m["limitations"]).lower()


def test_robustness_ablation_shows_noise_degrades_performance():
    r = robustness_ablation()
    assert r["soh"]["noisy_mae"] > r["soh"]["clean_mae"]
    assert r["eol_months"]["noisy_mae"] > r["eol_months"]["clean_mae"]


def test_cohort_is_large_enough_to_be_meaningful():
    assert load_metrics()["dataset"]["n_batteries"] >= 1000


# ===========================================================================
# CHECK 4 - scores reconcile with their explanations
# ===========================================================================

def test_data_confidence_reconciles(baseline):
    from app.services.quality import assess_quality

    for soh, rul, anom, flag in [(0.9, 20, 0.1, False), (0.7, 8, 0.6, True), (0.55, 1, 0.2, False)]:
        r = assess_quality(
            history_months=rul, reading_count=24, missing_count=2,
            duplicate_count=1, invalid_count=0, outlier_count=1,
        )
        assert r["reconciliation"]["consistent"], (
            f"confidence components {r['reconciliation']['sum_of_weighted_points']} "
            f"!= {r['data_confidence']}"
        )


def test_confidence_weights_sum_to_one():
    from app.services.quality import CONFIDENCE_WEIGHTS

    assert abs(sum(CONFIDENCE_WEIGHTS.values()) - 1.0) < 1e-9


def test_collection_priority_reconciles(baseline):
    items = baseline["queue"]["queue"]
    assert items, "the demo dataset must produce at least one EOL candidate"
    for i in items:
        assert i["reconciliation"]["consistent"], (
            f"{i['battery_id']}: factors {i['reconciliation']['sum_of_factor_points']} "
            f"!= {i['priority_score']}"
        )


def test_priority_weights_sum_to_one():
    from app.services.collection import PRIORITY_WEIGHTS

    assert abs(sum(PRIORITY_WEIGHTS.values()) - 1.0) < 1e-9


def test_circularity_reconciles(baseline):
    c = baseline["circularity"]
    if c["overall_score"] == 0.0 and not c.get("components"):
        pytest.skip("no batteries in the dataset")
    assert c["reconciliation"]["consistent"], (
        f"components {c['reconciliation']['sum_of_component_points']} != {c['overall_score']}"
    )
    assert 0 <= c["overall_score"] <= 100


def test_circularity_weights_sum_to_one():
    from app.services.circularity import CIRCULARITY_WEIGHTS

    assert abs(sum(CIRCULARITY_WEIGHTS.values()) - 1.0) < 1e-9


def test_circularity_components_explain_themselves(baseline):
    for c in baseline["circularity"]["components"]:
        assert len(c["explainer"]) > 40


def test_every_pathway_decision_lists_the_rules_that_fired(baseline):
    assert baseline["decisions"]
    for d in baseline["decisions"]:
        assert d["rules_fired"], f"{d['battery_id']} has a pathway with no rule fired"
        for r in d["rules_fired"]:
            assert r["statement"]
            assert r["evidence"]


def test_pathway_wording_never_certifies_safety(baseline):
    banned = ("guaranteed", "certified safe", "proven safe", "guarantee that")
    for d in baseline["decisions"]:
        low = d["wording"].lower()
        for b in banned:
            assert b not in low, f"unsafe wording {b!r} in {d['wording']}"


# ===========================================================================
# CHECK 5 - decision arithmetic is consistent
# ===========================================================================

def test_every_pathway_appears_and_counts_reconcile(baseline):
    from app.services.prevention import PATHWAY_LABELS

    counts = baseline["ledger"]["counts"]
    # Ledger count keys are the lowercase pathway labels.
    assert set(counts) == {p.lower() for p in PATHWAY_LABELS}
    assert sum(counts.values()) == baseline["ledger"]["total_batteries"]
    assert counts["eol_candidate"] + baseline["ledger"]["retained_batteries"] == len(
        baseline["records"]
    )


def test_avoided_units_equal_non_eol_count(baseline):
    ledger = baseline["ledger"]
    expected = ledger["retained_batteries"]
    assert ledger["potential_eol_waste_avoided_units"] == expected


def test_only_eol_candidates_enter_the_collection_queue(baseline):
    from app.services.prevention import EOL_CANDIDATE

    eol_ids = {
        d["battery_id"] for d in baseline["decisions"] if d["pathway"] == EOL_CANDIDATE
    }
    queued = {i["battery_id"] for i in baseline["queue"]["queue"]}
    assert queued == eol_ids


def test_collection_batch_arithmetic(baseline):
    b = baseline["batches"]
    for batch in b["batches"]:
        assert batch["battery_count"] == len(batch["batteries"])
        assert batch["battery_count"] <= b["trip_capacity_units"]
        assert batch["distance_saved_vs_solo_km"] >= 0
        assert batch["estimated_cost_inr"] > 0


def test_batching_saves_at_least_something(baseline):
    b = baseline["batches"]
    if b["total_batches"] >= 1:
        assert b["distance_saved_vs_solo_km"] > 0, (
            "batching saved no distance - the optimiser is not doing its job"
        )


def test_unscheduled_batteries_are_never_silently_dropped(baseline):
    b = baseline["batches"]
    for u in b.get("unscheduled", []):
        assert u["reason"]
    scheduled = {x for batch in b["batches"] for x in batch["batteries"]}
    unscheduled = {u["battery_id"] for u in b.get("unscheduled", [])}
    queued = {i["battery_id"] for i in baseline["queue"]["queue"]}
    assert scheduled | unscheduled == queued, "a queued battery vanished from both views"


# ===========================================================================
# CHECK 6 - capacity / budget never overspends
# ===========================================================================

def test_capacity_scenarios_never_exceed_trips(baseline):
    from app.services.collection import build_batches

    queue = baseline["queue"]
    for trips in (0, 1, 2, 3, 5, 8, 20):
        out = build_batches(queue, trip_capacity=6, trips_per_month=trips)
        assert out["total_batches"] <= trips, (
            f"{out['total_batches']} batches scheduled with only {trips} trips available"
        )


def test_batch_never_exceeds_trip_capacity(baseline):
    from app.services.collection import build_batches

    for cap in (1, 2, 3, 6, 12):
        out = build_batches(baseline["queue"], trip_capacity=cap, trips_per_month=50)
        for batch in out["batches"]:
            assert batch["battery_count"] <= cap


def test_collection_gap_is_never_negative_in_capacity_plan(baseline):
    gap = baseline["capacity"]["gap"]
    assert gap["processing_gap_units"] >= 0
    assert gap["collection_gap_units"] >= 0


def test_capacity_status_matches_the_gap(baseline):
    cap = baseline["capacity"]
    if cap["gap"]["processing_gap_units"] > 0:
        assert cap["status"] == "CAPACITY_MISMATCH"
        assert "capacity" in cap["recommendation"].lower()
    else:
        assert cap["status"] in ("CAPACITY_SUFFICIENT", "NO_FORECAST_INFLOW")


def test_unlimited_trips_schedule_everything(baseline):
    from app.services.collection import build_batches

    out = build_batches(baseline["queue"], trip_capacity=50, trips_per_month=999)
    assert out["unscheduled_count"] == 0


# ===========================================================================
# CHECK 7 - high priority stays visible
# ===========================================================================

def test_blind_spots_are_detected_and_actionable(baseline):
    bs = baseline["blind_spots"]
    assert bs["total_findings"] > 0, "the demo must contain traceability gaps to find"
    for cat, items in bs["findings"].items():
        for i in items:
            assert i["battery_id"]
            assert i["issue"]
            assert i["action"]
            assert i["severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def test_every_blind_spot_has_a_concrete_action(baseline):
    for items in baseline["blind_spots"]["findings"].values():
        for i in items:
            assert len(i["action"]) > 15, "blind spot has no actionable remedy"


def test_action_plan_references_real_battery_ids(baseline):
    ids = {r["battery_id"] for r in baseline["records"]}
    total = 0
    for horizon in baseline["action_plan"]["horizons"]:
        assert horizon["count"] == len(horizon["items"])
        for item in horizon["items"]:
            assert item["action"]
            assert item["rationale"]
            total += 1
            for bid in item["batteries"]:
                assert bid in ids, f"action plan references unknown battery {bid}"
    assert total > 0


# ===========================================================================
# CHECK 8/9 - GenAI grounding and fallback
# ===========================================================================

def _facts_for(baseline, battery_id=None):
    from app.services.genai import build_facts

    rec = next(
        r for r in baseline["records"]
        if r["battery_id"] == (battery_id or baseline["records"][0]["battery_id"])
    )
    dec = next(d for d in baseline["decisions"] if d["battery_id"] == rec["battery_id"])
    return build_facts(rec, dec), rec, dec


def test_fallback_works_with_no_key(baseline, no_genai_key):
    from app.services import genai

    assert genai.genai_available() is False
    out = genai.explain(_facts_for(baseline)[0], allow_external=True)
    assert out["source"] == "local-fallback"
    assert len(out["explanation"]) > 250


def test_fallback_is_deterministic(baseline, no_genai_key):
    from app.services import genai

    f = _facts_for(baseline)[0]
    assert genai.explain(f, True)["explanation"] == genai.explain(f, True)["explanation"]


def test_local_path_reachable_on_demand(baseline):
    from app.services import genai

    out = genai.explain(_facts_for(baseline)[0], allow_external=False)
    assert out["source"] == "local-fallback"
    assert out["explanation"]


def test_broken_endpoint_degrades_instead_of_raising(baseline, monkeypatch):
    from app.services import genai

    monkeypatch.setattr(genai.config, "GENAI_API_KEY", "not-a-real-key")
    monkeypatch.setattr(genai.config, "GENAI_ENDPOINT", "http://127.0.0.1:9/v1beta/models")
    monkeypatch.setattr(genai.config, "GENAI_TIMEOUT_SECONDS", 0.4)
    assert genai.genai_available() is True
    out = genai.explain(_facts_for(baseline)[0], allow_external=True)
    assert out["source"] == "local-fallback"
    assert out["fallback_reason"]


def test_facts_contain_no_ground_truth_leakage(baseline):
    facts, _, _ = _facts_for(baseline)
    flat = str(facts)
    for leak in ("true_soh", "true_eol_months", "_anomaly"):
        assert leak not in flat


def test_every_number_in_the_explanation_is_in_the_facts(baseline, no_genai_key):
    """The core grounding test."""
    from app.services import genai

    facts, _, _ = _facts_for(baseline)
    text = genai.explain(facts, allow_external=False)["explanation"]

    # Identifiers are removed first: a vehicle id like "EV-019" contains digits
    # that are naming, not measurement.
    scan = text.replace(facts["battery_id"], "<BID>")
    if facts.get("vehicle_id"):
        scan = scan.replace(str(facts["vehicle_id"]), "<VID>")
    scan = re.sub(r"(?<=\d),(?=\d)", "", scan)  # undo Indian digit grouping
    # Rule names (R9_ABOVE_EOL_THRESHOLD) embed thresholds, not measurements.
    scan = re.sub(r"\bR\d+[A-Z]*(?:_[A-Z0-9]+)*\b", "RULE", scan)

    allowed: set[str] = set()

    def walk(o):
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, (list, tuple)):
            for v in o:
                walk(v)
        elif isinstance(o, (int, float)) and not isinstance(o, bool):
            allowed.update({str(o), f"{o:.1f}", f"{o:.2f}", str(int(o)) if float(o).is_integer() else str(o)})

    walk(facts)
    structural = {"0", "1", "2", "3", "4", "5", "6", "100"}

    ungrounded = []
    for n in re.findall(r"\d+(?:\.\d+)?", scan):
        if n in allowed or n in structural:
            continue
        if any(
            abs(float(n) - float(a)) < 0.051
            for a in allowed if re.fullmatch(r"-?\d+(?:\.\d+)?", a)
        ):
            continue
        ungrounded.append(n)

    assert not ungrounded, (
        f"explanation contains numbers absent from backend facts: {sorted(set(ungrounded))}\n"
        f"TEXT:\n{text}\nFACTS:\n{facts}"
    )


def test_explanation_states_the_key_figures(baseline, no_genai_key):
    from app.services import genai

    facts, _, _ = _facts_for(baseline)
    text = genai.explain(facts, allow_external=False)["explanation"]
    assert facts["battery_id"] in text
    assert f"{facts['soh_pct']}%" in text
    assert facts["pathway_label"] in text


def test_explanation_makes_no_safety_or_compliance_claim(baseline, no_genai_key):
    from app.services import genai

    text = genai.explain(_facts_for(baseline)[0], allow_external=False)["explanation"].lower()
    assert "decision support" in text
    assert "does not certify" in text
    assert "regulatory compliance" in text
    for banned in ("certified safe", "guaranteed", "officially compliant"):
        assert banned not in text


def test_system_prompt_forbids_inventing_numbers():
    from app.services.genai import SYSTEM_PROMPT

    p = SYSTEM_PROMPT.lower()
    assert "only" in p
    assert "never invent" in p
    assert "unavailable" in p


def test_inr_formatting():
    from app.services.genai import inr

    assert inr(100000) == "INR 1,00,000"
    assert inr(65000) == "INR 65,000"
    assert inr(500) == "INR 500"


# ===========================================================================
# CHECK 12 - no external services required
# ===========================================================================

def test_no_external_datastore_is_configured():
    from app import config

    assert config.DATABASE_URL.startswith("sqlite://")
    assert not hasattr(config, "SUPABASE_URL")
    assert not hasattr(config, "REDIS_URL")


def test_app_code_imports_no_network_clients_except_genai():
    import re
    from pathlib import Path

    import app as app_pkg

    pkg = Path(app_pkg.__file__).parent
    net = ("requests", "httpx", "aiohttp", "socket", "ftplib", "smtplib")
    offenders = []
    for py in pkg.rglob("*.py"):
        if py.name == "genai.py":
            continue
        for m in re.findall(r"^\s*(?:import|from)\s+(\w+)", py.read_text(encoding="utf-8"), re.M):
            if m in net:
                offenders.append(f"{py.relative_to(pkg)}: {m}")
    assert not offenders, f"unexpected network imports: {offenders}"


def test_whole_api_works_with_outbound_http_blocked(client, monkeypatch):
    import urllib.request

    def blocked(*a, **kw):
        raise OSError("network disabled")

    monkeypatch.setattr(urllib.request, "urlopen", blocked)
    from app import config

    monkeypatch.setattr(config, "GENAI_API_KEY", "")

    for path in (
        "/api/health", "/api/meta", "/api/fleet/summary", "/api/fleet/vehicles",
        "/api/batteries", "/api/ml/metrics", "/api/ml/verify", "/api/ml/robustness",
        "/api/waste/forecast", "/api/waste/avoidance",
        "/api/collection/prioritize", "/api/collection/capacity",
        "/api/circularity/score", "/api/traceability/blind-spots",
        "/api/traceability/summary", "/api/action-plan", "/api/digital-twin/baseline",
        "/api/simulator/scenarios", "/api/reports/fleet.csv",
    ):
        assert client.get(path).status_code == 200, f"{path} failed offline"

    bid = client.get("/api/batteries").json()["batteries"][0]["battery_id"]
    vid = client.get("/api/batteries").json()["batteries"][0]["vehicle_id"]
    assert client.post("/api/reports/explain", json={"battery_id": bid}).status_code == 200
    assert client.post("/api/collection/batch", json={}).status_code == 200
    assert client.post("/api/simulator/run", json={"fleet_scale": 1.2}).status_code == 200
    # /api/waste/prevention is POST-only by design.
    assert client.post("/api/waste/prevention", json={}).status_code == 200
    for suffix in ("health", "rul", "anomaly", "lifecycle"):
        assert client.get(f"/api/vehicles/{vid}/{suffix}").status_code == 200


def test_no_migrations_or_seed_step_required_to_run(client):
    assert client.get("/api/fleet/summary").status_code == 200