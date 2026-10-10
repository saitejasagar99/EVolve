"""
Tests for Customer EV Battery Intelligence workflow.

Verifies:
  1. Ordinary EV owners can complete assessment without technical parameters
  2. Missing / "not sure" fields are handled safely
  3. Optional advanced technical data is accepted and utilized
  4. Automatic feature derivation produces valid ML features
  5. SOH, EOL horizon, and anomaly predictions execute on existing models
  6. Transparent explainability and honest confidence scores
  7. Downstream circularity workflows (EOL collection request & Second-life marketplace)
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.database.models import Battery, CollectionTask, CustomerAssessment, LifecycleEvent
from app.services.battery_feature_estimator import (
    calculate_analysis_confidence,
    estimate_battery_features,
    get_demo_presets,
    lookup_vehicle_spec,
)


@pytest.fixture(autouse=True)
def clean_customer_state(client: TestClient):
    """Ensure database is restored to clean simulated fleet after tests."""
    yield
    client.post("/api/demo/load", json={"count": 75, "reset": True})


def test_vehicle_spec_lookup():
    """Verify popular EV models map to valid baseline battery specifications."""
    nexon = lookup_vehicle_spec("Tata", "Nexon EV")
    assert nexon["capacity_kwh"] > 30.0
    assert nexon["chemistry"] == "LFP"
    assert nexon["epk"] > 0.1

    zs = lookup_vehicle_spec("MG", "ZS EV")
    assert zs["capacity_kwh"] >= 50.0

    fallback = lookup_vehicle_spec("Custom", "Unknown Model")
    assert fallback["capacity_kwh"] == 40.0


def test_feature_derivation_without_technical_data():
    """Prove technical features can be derived purely from simple customer answers."""
    simple_input = {
        "vehicle_brand": "Tata",
        "vehicle_model": "Nexon EV",
        "purchase_year": 2023,
        "odometer_km": 42000,
        "daily_driving": "20_50",
        "charging_frequency": "3_5_week",
        "charging_method": "home",
        "driving_pattern": "city",
        "range_condition": "slightly_reduced",
        "charging_condition": "normal",
        "temperature_condition": "normal",
        "warning_condition": "none",
        "range_fluctuation": "never",
        "city": "Hyderabad",
        "state": "Telangana",
    }
    result = estimate_battery_features(simple_input)
    feats = result["features"]
    prov = result["provenance"]

    assert feats["months_in_service"] > 0
    assert feats["daily_km"] > 0
    assert feats["equivalent_full_cycles"] > 0
    assert feats["energy_throughput_kwh"] > 0
    assert 0.0 <= feats["fast_charge_ratio"] <= 1.0
    assert 0.0 <= feats["depth_of_discharge"] <= 1.0
    assert feats["ambient_temp_c"] > 20.0
    assert feats["avg_cell_temp_c"] >= feats["ambient_temp_c"]
    assert feats["measured_capacity_fade_pct"] > 0.0

    # Verify provenance labeling
    assert prov["months_in_service"] == "DERIVED"
    assert prov["odometer_km"] == "USER_PROVIDED"
    assert prov["ambient_temp_c"] == "ESTIMATED"
    assert prov["measured_capacity_fade_pct"] == "ESTIMATED"


def test_handle_unknown_or_missing_inputs():
    """Ensure 'I'm not sure' or missing odometer never breaks estimation."""
    incomplete_input = {
        "vehicle_brand": "Other",
        "vehicle_model": "Unknown",
        "purchase_year": 2024,
        "odometer_km": None,
        "daily_driving": "unknown",
        "charging_frequency": "unknown",
        "charging_method": "unknown",
        "range_condition": "unknown",
        "charging_condition": "unknown",
        "temperature_condition": "unknown",
        "warning_condition": "none",
        "range_fluctuation": "unknown",
        "city": "Bengaluru",
        "state": "Karnataka",
    }
    result = estimate_battery_features(incomplete_input)
    feats = result["features"]
    assert feats["daily_km"] > 0
    assert feats["equivalent_full_cycles"] > 0
    assert feats["odometer_km"] > 0

    conf = calculate_analysis_confidence(incomplete_input)
    assert 50.0 <= conf["confidence_pct"] <= 75.0
    assert conf["confidence_band"] in ("MEDIUM", "LOW")


def test_optional_advanced_data_integration():
    """Optional advanced parameters override estimates when supplied."""
    advanced_input = {
        "vehicle_brand": "Tata",
        "vehicle_model": "Nexon EV",
        "purchase_year": 2023,
        "odometer_km": 30000,
        "battery_capacity_kwh": 40.5,
        "battery_chemistry": "LFP",
        "soh_input": 84.5,
        "internal_resistance_mohm": 24.5,
        "city": "Delhi",
        "state": "Delhi",
    }
    result = estimate_battery_features(advanced_input)
    feats = result["features"]
    prov = result["provenance"]

    assert feats["rated_capacity_kwh"] == 40.5
    assert prov["rated_capacity_kwh"] == "USER_PROVIDED"
    assert feats["dc_resistance_mohm"] == 24.5
    assert prov["dc_resistance_mohm"] == "USER_PROVIDED"
    assert feats["measured_capacity_fade_pct"] == round(100.0 - 84.5, 2)
    assert prov["measured_capacity_fade_pct"] == "USER_PROVIDED"


def test_customer_battery_input_endpoint(client: TestClient):
    """Test POST /api/customer/battery-input preparing summary & confidence."""
    payload = {
        "vehicle_brand": "Tata",
        "vehicle_model": "Nexon EV",
        "purchase_year": 2023,
        "odometer_km": 38000,
        "daily_driving": "20_50",
        "charging_frequency": "3_5_week",
        "charging_method": "home",
        "driving_pattern": "city",
        "range_condition": "same",
        "charging_condition": "normal",
        "temperature_condition": "normal",
        "warning_condition": "none",
        "range_fluctuation": "never",
        "city": "Hyderabad",
        "state": "Telangana",
    }
    resp = client.post("/api/customer/battery-input", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "draft_id" in data
    assert "summary" in data
    assert "confidence" in data
    assert data["confidence"]["confidence_pct"] >= 80.0
    assert data["summary"]["usage_intensity"] in ("Low", "Medium", "High")
    assert "technical_details" in data


def test_customer_analyze_and_report_flow(client: TestClient, db):
    """Test full customer analysis flow without technical parameters."""
    payload = {
        "vehicle_brand": "Tata",
        "vehicle_model": "Nexon EV",
        "purchase_year": 2023,
        "odometer_km": 35000,
        "daily_driving": "20_50",
        "charging_frequency": "3_5_week",
        "charging_method": "home",
        "driving_pattern": "city",
        "range_condition": "same",
        "charging_condition": "normal",
        "temperature_condition": "normal",
        "warning_condition": "none",
        "range_fluctuation": "never",
        "city": "Hyderabad",
        "state": "Telangana",
        "is_demo": True,
    }
    # 1. Analyze
    resp = client.post("/api/customer/analyze/new", json=payload)
    assert resp.status_code == 200
    report = resp.json()

    assert "assessment_id" in report
    assert "health" in report
    assert report["health"]["soh_pct"] > 50.0
    assert report["health"]["status_band"] in ("Good", "Fair", "Needs Attention", "Critical")
    assert "future_risk" in report
    assert "remaining_life" in report
    assert "recommendation" in report
    assert len(report["why_points"]) > 0
    assert "confidence" in report

    # 2. Retrieve report by ID
    ass_id = report["assessment_id"]
    get_resp = client.get(f"/api/customer/battery/{ass_id}/report")
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["assessment_id"] == ass_id
    assert get_data["vehicle"]["brand"] == "Tata"

    # 3. Check history timeline
    hist_resp = client.get(f"/api/customer/battery/{ass_id}/history")
    assert hist_resp.status_code == 200
    hist = hist_resp.json()
    assert len(hist["timeline"]) >= 1


def test_customer_collection_and_second_life_requests(client: TestClient):
    """Verify EOL collection request and Second-Life marketplace listing requests."""
    # Analyze an EOL battery preset
    presets = get_demo_presets()
    eol_preset = next(p for p in presets if p["id"] == "demo-tigor-eol")

    resp = client.post("/api/customer/analyze/eol-test", json=eol_preset["data"])
    assert resp.status_code == 200
    report = resp.json()
    bat_id = report["assessment_id"]

    # 1. Request Collection
    col_req = {
        "battery_id": bat_id,
        "contact_name": "Ramesh Kumar",
        "contact_phone": "+91 98765 43210",
        "pickup_address": "Plot 42, Jubilee Hills",
        "city": "Hyderabad",
        "state": "Telangana",
        "preferred_date": "2026-10-15",
        "notes": "Pack in parking area ready for pickup",
    }
    col_resp = client.post("/api/customer/collection-request", json=col_req)
    assert col_resp.status_code == 200
    assert col_resp.json()["status"] == "success"

    # 2. Request Second Life on a candidate
    sl_preset = next(p for p in presets if p["id"] == "demo-xuv-secondlife")
    resp_sl = client.post("/api/customer/analyze/sl-test", json=sl_preset["data"])
    assert resp_sl.status_code == 200
    sl_bat_id = resp_sl.json()["assessment_id"]

    sl_req = {
        "battery_id": sl_bat_id,
        "contact_name": "Anita Roy",
        "contact_phone": "+91 98123 45678",
        "listing_intent": "ASSESSMENT_AND_MARKETPLACE",
        "notes": "Interested in stationary solar resale",
    }
    sl_resp = client.post("/api/customer/second-life-request", json=sl_req)
    assert sl_resp.status_code == 200
    assert sl_resp.json()["status"] == "success"

    # 3. Check consumer marketplace
    market_resp = client.get("/api/consumer/second-life-marketplace")
    assert market_resp.status_code == 200
    market = market_resp.json()
    assert market["count"] >= 1
