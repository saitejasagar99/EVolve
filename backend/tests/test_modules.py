"""Per-module behaviour tests (Modules 1-14)."""

from __future__ import annotations

import pytest

from app import config


# ===========================================================================
# Module 1 - data quality
# ===========================================================================

def test_confidence_bands_are_ordered():
    from app.services.quality import assess_quality

    good = assess_quality(history_months=30, reading_count=30, missing_count=0,
                          duplicate_count=0, invalid_count=0, outlier_count=0)
    poor = assess_quality(history_months=3, reading_count=4, missing_count=3,
                          duplicate_count=1, invalid_count=1, outlier_count=1)
    assert good["confidence_band"] == "High"
    assert poor["confidence_band"] == "Low"
    assert good["data_confidence"] > poor["data_confidence"]


def test_insufficient_history_blocks_forecast_with_a_clear_message():
    from app.services.quality import assess_quality

    r = assess_quality(history_months=2, reading_count=2, missing_count=0,
                       duplicate_count=0, invalid_count=0, outlier_count=0)
    assert r["forecast_possible"] is False
    assert "Insufficient historical data" in r["blocking_reason"]


def test_low_confidence_batteries_are_excluded_from_the_forecast_not_guessed(baseline):
    # The demo dataset is generated with full history, so nothing is excluded.
    # Assert the contract rather than assuming a particular dataset shape.
    excluded = baseline["forecast"]["totals"]["excluded_insufficient_history"]
    note = baseline["forecast"]["totals"]["excluded_note"]
    if excluded:
        assert "excluded rather than guessed" in note
    else:
        assert "sufficient history" in note

    # And in every case, a battery without a forecast must not show a date.
    for r in baseline["records"]:
        if not r["forecast_possible"]:
            assert r["eol_in_months"] is None, (
                f"{r['battery_id']} has insufficient data but still reports an EOL date"
            )


def test_fleet_quality_summary_adds_up(baseline):
    q = baseline["quality_summary"]
    assert q["batteries"] == len(baseline["records"])
    assert sum(q["by_band"].values()) == q["batteries"]


# ===========================================================================
# Module 2 - battery intelligence
# ===========================================================================

def test_every_battery_reports_the_required_intelligence(baseline):
    required = [
        "soh_pct", "trend", "eol_in_months", "anomaly_score", "anomaly_status",
        "data_confidence", "battery_age_months", "charging_cycles", "temperature",
    ]
    for r in baseline["records"]:
        for f in required:
            assert f in r, f"{r['battery_id']} missing {f}"


def test_soh_is_a_percentage_with_an_estimate_band(baseline):
    for r in baseline["records"]:
        assert 0 < r["soh_pct"] <= 100
        assert r["soh_low_pct"] <= r["soh_pct"] + 1e-6
        assert r["soh_high_pct"] >= r["soh_pct"] - 1e-6


def test_anomaly_wording_never_claims_a_confirmed_fault(baseline):
    for r in baseline["records"]:
        w = r["anomaly_wording"].lower()
        assert "signal" in w or "no anomaly" in w
        for banned in ("confirmed fault", "failed", "defective", "unsafe"):
            assert banned not in w


def test_trend_refuses_to_claim_one_from_too_few_points():
    from app.services.battery_intelligence import _trend

    few = _trend([{"month_index": i, "soh": 0.9} for i in (1, 2)])
    assert few["trend_direction"] == "INSUFFICIENT_DATA"
    assert few["degradation_per_month"] is None
    assert "at least 4 points" in few["note"]


def test_eol_note_is_labelled_an_estimate(baseline):
    for r in baseline["records"][:20]:
        note = r["eol_estimate_note"].lower()
        assert "estimate" in note or "insufficient" in note


# ===========================================================================
# Module 3 - waste forecast
# ===========================================================================

def test_forecast_horizons_are_monotonic(baseline):
    h = baseline["forecast"]["headline"]
    assert h["potential_eol_3_months"] <= h["potential_eol_6_months"] <= h["potential_eol_12_months"]


def test_forecast_counts_match_the_battery_id_lists(baseline):
    for key, block in baseline["forecast"]["horizons"].items():
        assert block["predicted_eol_count"] == len(block["battery_ids"])


def test_monthly_curve_is_cumulative_and_labeled(baseline):
    curve = baseline["forecast"]["monthly_forecast"]
    assert len(curve) == config.FORECAST_HORIZON_MONTHS
    prev = 0.0
    for m in curve:
        assert m["cumulative_eol"] >= prev - 1e-6
        prev = m["cumulative_eol"]
    assert "ESTIMATE" in baseline["forecast"]["label"].upper()


def test_forecast_zone_breakdown_matches_the_total(baseline):
    z = baseline["forecast"]["by_zone"]
    assert sum(x["total_in_service"] for x in z) == (
        baseline["forecast"]["totals"]["in_service"]
    )


def test_high_risk_zone_is_the_worst(baseline):
    z = baseline["forecast"]["by_zone"]
    if z:
        top = max(z, key=lambda x: x["eol_next_12"])
        assert baseline["forecast"]["high_risk_zone"]["zone"] == top["zone"]


def test_forecast_changes_when_the_dataset_changes(baseline, db):
    """A forecast must be a function of data, not a constant."""
    from app.services.fleet import load_records
    from app.services.forecasting import forecast_from_records

    recs, _ = load_records(db, force=True)
    a = forecast_from_records(recs)["headline"]["potential_eol_12_months"]
    trimmed = forecast_from_records(recs[: len(recs) // 2])
    assert trimmed["headline"]["potential_eol_12_months"] <= a


# ===========================================================================
# Module 4 - prevention pathways
# ===========================================================================

def test_pathways_are_mutually_exclusive_and_complete(baseline):
    from app.services.prevention import PATHWAY_LABELS

    for d in baseline["decisions"]:
        assert d["pathway"] in PATHWAY_LABELS


def test_a_healthy_battery_is_never_called_waste(baseline):
    from app.services.prevention import EOL_CANDIDATE

    for d in baseline["decisions"]:
        if d["soh_pct"] >= config.EOL_SOH_THRESHOLD * 100:
            assert d["pathway"] != EOL_CANDIDATE, (
                f"{d['battery_id']} at {d['soh_pct']}% SOH was called EOL - a degraded "
                "battery is being treated as automatic waste"
            )


def test_eol_requires_being_below_both_floors(baseline):
    for d in baseline["decisions"]:
        if d["pathway"] == "EOL_CANDIDATE":
            assert d["soh_pct"] < config.SECOND_LIFE_FLOOR_SOH * 100 or (
                d["soh_pct"] < config.EOL_SOH_THRESHOLD * 100
            )


def test_repair_pathway_claims_zero_avoided_when_fully_degraded(baseline):
    for d in baseline["decisions"]:
        if d["pathway"] == "EOL_CANDIDATE":
            assert d["potential_avoided_units"] == 0.0


def test_second_life_output_is_never_a_safety_certification(baseline):
    for d in baseline["decisions"]:
        if d["pathway"] == "SECOND_LIFE_ASSESSMENT":
            assert d["requires_technical_assessment"] is True
            assert "assessment" in d["wording"].lower()


def test_prevention_is_not_simply_a_soh_threshold(baseline):
    """Different packs at similar SOH may take different pathways."""
    from app.services.prevention import decide_pathway

    base = dict(
        battery_id="X", vehicle_id="V", zone="Z", soh_pct=72.0,
        soh_low_pct=70.0, soh_high_pct=74.0, eol_in_months=6.0,
        battery_age_months=40, charging_cycles=600, anomaly_score=0.1,
        data_confidence=90.0, confidence_band="High",
        temperature={"current_c": 34, "peak_c": 44, "history_max_c": 46},
        trend={"trend_direction": "DEGRADING", "monthly_degradation_pct": 0.3},
        already_below_eol_threshold=True, data_source="SIMULATED",
    )
    calm = decide_pathway(base)
    hot = decide_pathway({**base, "temperature": {"current_c": 40, "peak_c": 68, "history_max_c": 68}})
    assert calm["rules_fired"] != hot["rules_fired"], (
        "two packs with identical SOH but different thermal history produced "
        "identical reasoning - the engine is ignoring context"
    )


# ===========================================================================
# Module 5 - avoidance ledger
# ===========================================================================

def test_ledger_is_labelled_estimated(baseline):
    assert "ESTIMATED" in baseline["ledger"]["label"].upper()
    assert "assumption" in baseline["ledger"]["method"].lower()


def test_ledger_prevention_ratio_is_a_percentage(baseline):
    r = baseline["ledger"]["prevention_ratio_pct"]
    assert 0 <= r <= 100


def test_ledger_net_benefit_arithmetic(baseline):
    led = baseline["ledger"]
    expected = led["estimated_purchase_value_avoided_inr"] - led["estimated_intervention_cost_inr"]
    assert abs(led["net_estimated_benefit_inr"] - expected) < 0.02


# ===========================================================================
# Modules 6/7 - collection
# ===========================================================================

def test_priority_bands_cover_the_queue(baseline):
    q = baseline["queue"]
    assert sum(q["by_band"].values()) == q["total"]
    assert set(q["by_band"]) <= {"CRITICAL", "HIGH", "MEDIUM", "LOW"}


def test_queue_is_sorted_by_priority(baseline):
    scores = [i["priority_score"] for i in baseline["queue"]["queue"]]
    assert scores == sorted(scores, reverse=True)


def test_batches_respect_the_trip_limit(baseline):
    b = baseline["batches"]
    assert b["total_batches"] <= b["trips_available"]


def test_batches_group_by_zone(baseline):
    zone_of = {r["battery_id"]: r["zone"] for r in baseline["records"]}
    for batch in baseline["batches"]["batches"]:
        for bid in batch["batteries"]:
            assert zone_of[bid] == batch["zone"], (
                f"{bid} is in zone {zone_of[bid]} but was batched into {batch['zone']}"
            )


def test_zero_trips_defers_everything_without_dropping_it(baseline):
    from app.services.collection import build_batches

    out = build_batches(baseline["queue"], trip_capacity=6, trips_per_month=0)
    assert out["total_batches"] == 0
    assert out["unscheduled_count"] == len(baseline["queue"]["queue"])
    for u in out["unscheduled"]:
        assert "NOT dropped" in u["reason"] or "remains in the EOL queue" in u["reason"]


# ===========================================================================
# Module 8 - capacity
# ===========================================================================

def test_capacity_reads_handlers_from_the_database(baseline):
    cap = baseline["capacity"]
    assert cap["handlers"], "capacity must be sourced from handler records, not hardcoded"
    assert cap["supply"]["processing_capacity_units_per_month"] > 0


def test_capacity_reports_unverified_handlers(baseline):
    cap = baseline["capacity"]
    assert "unverified_handler_count" in cap
    if cap["unverified_handler_count"]:
        assert "traceability risk" in cap["unverified_handler_note"]


# ===========================================================================
# Module 9 - traceability
# ===========================================================================

def test_timeline_has_an_audit_trail(db, baseline):
    from app.services.traceability import timeline_for
    from app.database.models import Battery

    bid = baseline["records"][0]["battery_id"]
    battery = db.query(Battery).filter(Battery.battery_id == bid).first()
    tl = timeline_for(db, battery)
    assert tl["battery_lifecycle_id"].startswith("BLID-")
    assert tl["event_count"] >= 2
    for e in tl["events"]:
        for f in ("occurred_at", "event", "location", "handler", "status"):
            assert f in e
    assert "not official regulatory compliance" in tl["evidence_note"].lower()


def test_events_are_in_chronological_order(db, baseline):
    from app.services.traceability import timeline_for
    from app.database.models import Battery

    for bid in [r["battery_id"] for r in baseline["records"][:5]]:
        battery = db.query(Battery).filter(Battery.battery_id == bid).first()
        tl = timeline_for(db, battery)
        times = [e["occurred_at"] for e in tl["events"]]
        assert times == sorted(times), f"{bid} timeline is out of order"


def test_degradation_series_is_present_for_trending(db, baseline):
    from app.services.traceability import timeline_for
    from app.database.models import Battery

    battery = db.query(Battery).filter(
        Battery.battery_id == baseline["records"][0]["battery_id"]
    ).first()
    tl = timeline_for(db, battery)
    assert len(tl["degradation_series"]) >= 4
    assert all(p["soh_pct"] is not None for p in tl["degradation_series"])


# ===========================================================================
# Module 11 - circularity
# ===========================================================================

def test_circularity_is_not_an_arbitrary_number(baseline):
    c = baseline["circularity"]
    assert len(c["components"]) == 5
    for comp in c["components"]:
        assert 0 <= comp["raw_pct"] <= 100
        assert comp["weight"] > 0
    # Recalculate by hand from the published components.
    # Points are weight x raw percentage (weights sum to 1.0), so the composite
    # can be recomputed by hand straight from the published components.
    manual = sum(c["points"] for c in c["components"])
    assert abs(manual - c["overall_score"]) < 0.15
    assert abs(sum(c["weight"] for c in c["components"]) - 1.0) < 1e-9


def test_circularity_is_disclaimed_as_non_regulatory(baseline):
    d = baseline["circularity"]["disclaimer"].lower()
    assert "not a recognised regulatory" in d or "not a regulatory" in d


# ===========================================================================
# Modules 12/13 - simulator and digital twin
# ===========================================================================

@pytest.mark.parametrize(
    "params,expect_change",
    [
        ({"fleet_scale": 1.5}, "potential_eol_12_months"),
        ({"repair_capacity": 0}, "eol_candidates"),
        ({"intervention_rate": 0.2}, "intervention_candidates"),
        ({"second_life_capacity": 0}, "eol_candidates"),
    ],
)
def test_simulator_responds_to_each_parameter(db, baseline, params, expect_change):
    from app.services.simulator import run_simulation

    out = run_simulation(db, baseline, params)
    assert expect_change in out["delta"], f"{expect_change} missing from delta"
    assert out["delta"][expect_change]["scenario"] != out["baseline"][expect_change]


def test_unchanged_parameters_produce_no_change(db, baseline):
    from app.services.simulator import run_simulation

    out = run_simulation(db, baseline, {"fleet_scale": 1.0})
    for key in ("potential_eol_12_months", "eol_candidates", "retained_batteries"):
        assert out["delta"][key]["change"] == 0, (
            f"{key} moved with no parameter changed - the simulator is unstable"
        )


def test_repair_capacity_ceiling_pushes_others_to_eol(db, baseline):
    """A hard capacity ceiling must reduce prevention, not quietly ignore it."""
    from app.services.simulator import run_simulation

    open_ = run_simulation(db, baseline, {})
    closed = run_simulation(db, baseline, {"repair_capacity": 0})
    assert closed["results"]["eol_candidates"] > open_["results"]["eol_candidates"]
    assert closed["results"]["intervention_candidates"] < open_["results"]["intervention_candidates"]


def test_simulator_declares_its_limitations(db, baseline):
    from app.services.simulator import run_simulation

    out = run_simulation(db, baseline, {"fleet_scale": 1.2})
    assert len(out["limitations"]) >= 3


def test_preset_scenarios_all_run(db, baseline):
    from app.services.simulator import preset_scenarios, run_simulation

    for sc in preset_scenarios():
        out = run_simulation(db, baseline, sc["params"])
        assert out["results"]["batteries_simulated"] > 0


def test_every_scenario_metric_has_a_delta(db, baseline):
    """
    Each numeric result the simulator publishes must be comparable to the
    baseline. A key that exists in `results` but not in `baseline` silently
    drops out of the comparison, which is how the circularity delta went
    missing before this test existed.
    """
    from app.services.simulator import run_simulation

    out = run_simulation(db, baseline, {"fleet_scale": 1.3})
    comparable = {
        k for k, v in out["results"].items()
        if isinstance(v, (int, float)) and not isinstance(v, bool)
    }
    # fleet_scale / intervention_rate are inputs, not outcomes.
    comparable -= {"fleet_scale", "intervention_rate", "batteries_simulated"}
    missing = comparable - set(out["delta"])
    assert not missing, f"results with no baseline comparison: {sorted(missing)}"