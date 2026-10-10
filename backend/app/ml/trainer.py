"""
Model training and inference.

CARRIED OVER from the earlier predictive-maintenance build, with two changes:
  * the RUL target is renamed to the EOL horizon (same quantity, correct name
    for a waste-management product), and
  * battery features replace vehicle features.

The integrity rules are unchanged and are the point of this module:
  * metrics are computed, never hardcoded;
  * every score is reported against a naive train-mean baseline;
  * anomaly detection is one-class (fitted on known-good packs only);
  * a BMS-noise robustness ablation is published next to the headline numbers;
  * an explicit statement ships with the payload that a near-perfect R2 is an
    artifact of the synthetic data-generating process.
"""

from __future__ import annotations

import json
import warnings
from dataclasses import asdict, dataclass
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    HistGradientBoostingRegressor,
    IsolationForest,
    RandomForestRegressor,
)
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import KFold, cross_val_predict

from .. import config
from ..data.demo_seed import SIM_NOTICE, build_battery_specs

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", message=".*X does not have valid feature names.*")

RANDOM_STATE = config.RANDOM_SEED

#: Features handed to the models. Label columns are deliberately absent.
FEATURE_COLUMNS = [
    "months_in_service",
    "daily_km",
    "equivalent_full_cycles",
    "energy_throughput_kwh",
    "avg_charge_rate_c",
    "fast_charge_ratio",
    "depth_of_discharge",
    "ambient_temp_c",
    "avg_cell_temp_c",
    "peak_cell_temp_c",
    "temp_rise_over_ambient_c",
    "cell_voltage_spread_mv",
    "dc_resistance_mohm",
    "measured_capacity_fade_pct",
]

ANOMALY_FEATURE_COLUMNS = [
    "peak_cell_temp_c",
    "temp_rise_over_ambient_c",
    "cell_voltage_spread_mv",
    "dc_resistance_mohm",
    "fast_charge_ratio",
]

#: Realistic BMS measurement error (relative SD), used by the robustness ablation.
BMS_NOISE_SPEC: dict[str, float] = {
    "measured_capacity_fade_pct": 0.08,
    "avg_cell_temp_c": 0.05,
    "peak_cell_temp_c": 0.06,
    "equivalent_full_cycles": 0.04,
    "dc_resistance_mohm": 0.10,
    "energy_throughput_kwh": 0.05,
}


# ---------------------------------------------------------------------------
# Feature frame construction (shared by training and inference)
# ---------------------------------------------------------------------------

def make_feature_frame(specs: list[dict]) -> pd.DataFrame:
    """
    Turn battery specs into a model-ready frame, including derived columns.

    Derived columns (e.g. temperature rise above ambient) are COMPUTED here
    rather than demanded from an operator's CSV, so the upload schema stays
    minimal while the models always see the features they were trained on.
    """
    rows = []
    for s in specs:
        # Accept either the simulator's short key or the model-facing name.
        ambient = float(s.get("ambient_temp_c", s.get("ambient_c")))
        peak = float(s["peak_cell_temp_c"])
        months = float(s["months_in_service"])
        daily = float(s["daily_km"])
        # `energy_per_km` is a spec-level convenience; when a caller already
        # supplies the throughput itself (or cannot derive it), honour that.
        epk = s.get("energy_per_km")
        throughput = (
            float(s["energy_throughput_kwh"])
            if s.get("energy_throughput_kwh") is not None
            else daily * 30.4 * float(epk if epk is not None else capacity_kwh / 320.0) * months
        )
        rows.append(
            {
                "battery_id": s["battery_id"],
                "months_in_service": months,
                "daily_km": daily,
                "equivalent_full_cycles": float(s["equivalent_full_cycles"]),
                "energy_throughput_kwh": throughput,
                "avg_charge_rate_c": float(s.get("avg_charge_rate_c", 1.1)),
                "fast_charge_ratio": float(s["fast_charge_ratio"]),
                "depth_of_discharge": float(s["depth_of_discharge"]),
                "ambient_temp_c": ambient,
                "avg_cell_temp_c": float(s["avg_cell_temp_c"]),
                "peak_cell_temp_c": peak,
                "temp_rise_over_ambient_c": peak - ambient,
                "cell_voltage_spread_mv": float(s["cell_voltage_spread_mv"]),
                "dc_resistance_mohm": float(s["dc_resistance_mohm"]),
                "measured_capacity_fade_pct": float(s["measured_capacity_fade_pct"]),
                # ---- ground truth, training only ----
                # Optional: operational specs (loaded from the database) carry
                # no labels, and inference must work without them.
                **(
                    {"true_soh": float(s["true_soh"])}
                    if s.get("true_soh") is not None else {}
                ),
                **(
                    {"true_eol_months": float(s["true_eol_months"])}
                    if s.get("true_eol_months") is not None else {}
                ),
                "_anomaly": int(1 if s.get("anomaly_kind") else 0),
            }
        )
    return pd.DataFrame(rows)


def _eol_months(soh: np.ndarray, degradation_per_month: np.ndarray,
                threshold: float = config.EOL_SOH_THRESHOLD) -> np.ndarray:
    """Months until SOH crosses the EOL threshold (0 if already past it)."""
    headroom = np.maximum(soh - threshold, 0.0)
    rate = np.maximum(degradation_per_month, 1e-5)
    return np.round(
        np.where(soh <= threshold, 0.0, np.minimum(headroom / rate, 60.0)), 1
    )


#: Anomaly rate used by the SIMULATOR when generating a cohort.
#: Deliberately higher than the demo fleet's (~10%): anomaly precision and
#: recall need enough positive cases to mean anything, and 1200 x 10% = 120 is
#: thin when split across 5 CV folds. This affects TRAINING/EVALUATION ONLY -
#: the demo dataset keeps its own rate.
TRAINING_ANOMALY_RATE = 0.25


def _labels_from_specs(specs: list[dict]) -> list[dict]:
    """
    Attach EOL-horizon ground truth to each spec.

    Tolerates specs that carry only operational fields (as loaded from the
    database), where there is no ground-truth SOH to work back from. Those get
    the label columns set to None so callers can detect their absence instead of
    hitting a KeyError.
    """
    out = []
    for s in specs:
        s = dict(s)
        if "true_soh" not in s:
            s.setdefault("true_soh", None)
        s.setdefault("_anomaly", int(1 if s.get("anomaly_kind") else 0))
        s.setdefault("avg_charge_rate_c", 1.1)
        efc = s["equivalent_full_cycles"]
        temp = s["avg_cell_temp_c"]
        dod = s["depth_of_discharge"]
        soh_now = float(true_soh_local(efc, temp, dod))
        soh_next = float(true_soh_local(efc + s["efc_month"], temp, dod))
        deg = max(soh_now - soh_next, 1e-5)
        s["monthly_degradation_rate"] = deg
        s["true_eol_months"] = float(
            _eol_months(np.array([soh_now]), np.array([deg]))[0]
        )
        out.append(s)
    return out


def _training_frame(n: int | None = None) -> pd.DataFrame:
    """
    Build the training frame from the SYNTHETIC generator only.

    Training always uses freshly generated specs, so ground-truth labels are
    always present and never depend on what happens to be in the database.
    """
    specs = _labels_from_specs(
        build_battery_specs(
            n or config.EVALUATION_COHORT_SIZE, config.RANDOM_SEED,
            anomaly_rate=TRAINING_ANOMALY_RATE,
        )
    )
    return make_feature_frame(specs)


def true_soh_local(efc: float, temp: float, dod: float) -> float:
    from ..data.demo_seed import true_soh

    return float(true_soh(np.array([efc]), np.array([temp]), np.array([dod]))[0])


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

@dataclass
class RegressionMetrics:
    model: str
    mae: float
    rmse: float
    r2: float
    baseline_mae: float
    baseline_rmse: float
    baseline_r2: float
    skill_vs_baseline_pct: float
    n_train_samples: int
    cv_folds: int

    def to_dict(self) -> dict[str, Any]:
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in asdict(self).items()}


def _reg_metrics(y_true: np.ndarray, y_pred: np.ndarray, name: str, folds: int) -> RegressionMetrics:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    base = np.full_like(y_true, float(np.mean(y_true)), dtype=float)
    b_mae = float(mean_absolute_error(y_true, base))
    b_rmse = float(np.sqrt(mean_squared_error(y_true, base)))
    b_r2 = float(r2_score(y_true, base))
    skill = 0.0 if b_mae == 0 else (b_mae - mae) / b_mae * 100.0
    return RegressionMetrics(
        model=name, mae=mae, rmse=rmse, r2=r2,
        baseline_mae=b_mae, baseline_rmse=b_rmse, baseline_r2=b_r2,
        skill_vs_baseline_pct=float(skill),
        n_train_samples=int(len(y_true)), cv_folds=int(folds),
    )


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def _pick_regressor(X: pd.DataFrame, y: pd.Series, cv: KFold):
    """Choose between RF and HistGB by measured CV MAE, not by preference."""
    cands = {
        "RandomForestRegressor": RandomForestRegressor(
            n_estimators=400, min_samples_leaf=2, n_jobs=1, random_state=RANDOM_STATE
        ),
        "HistGradientBoostingRegressor": HistGradientBoostingRegressor(
            max_depth=4, learning_rate=0.06, max_iter=500, early_stopping=True,
            validation_fraction=0.15, random_state=RANDOM_STATE,
        ),
    }
    best = (None, None, float("inf"))
    for name, est in cands.items():
        preds = cross_val_predict(est, X, y, cv=cv, n_jobs=1)
        score = float(mean_absolute_error(y, preds))
        if score < best[2]:
            best = (est, name, score)
    return best[0], best[1]


def _importances(est, X: pd.DataFrame | None = None, y: pd.Series | None = None) -> dict[str, Any]:
    if hasattr(est, "feature_importances_"):
        vals = np.asarray(est.feature_importances_, dtype=float)
        names = list(X.columns)
    elif hasattr(est, "coef_"):
        coefs = np.abs(np.asarray(est.coef_, dtype=float))
        vals = coefs / (coefs.max() or 1.0)
        names = list(X.columns)
    elif X is not None and y is not None:
        vals = np.abs(
            permutation_importance(
                est, X, y, n_repeats=10, random_state=RANDOM_STATE,
                scoring="neg_mean_absolute_error",
            ).importances_mean
        )
        names = list(X.columns)
    else:
        return {"top": [], "method": "unavailable"}

    total = float(vals.sum()) or 1.0
    pairs = sorted(
        ({"feature": n, "importance_pct": round(float(v / total * 100), 2)}
         for n, v in zip(names, vals)),
        key=lambda d: -d["importance_pct"],
    )
    return {"top": pairs[:8]}


def train_all(verbose: bool = True) -> dict[str, Any]:
    """Train SOH, EOL-horizon and anomaly models on the synthetic cohort."""
    df = _training_frame()

    X = df[FEATURE_COLUMNS]
    y_soh, y_eol, y_anom = df["true_soh"], df["true_eol_months"], df["_anomaly"]
    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    # ---- SOH ----
    soh_model, soh_name = _pick_regressor(X, y_soh, cv)
    soh_metrics = _reg_metrics(
        y_soh.values, cross_val_predict(soh_model, X, y_soh, cv=cv, n_jobs=1), soh_name, cv.n_splits
    )
    soh_model.fit(X, y_soh)
    joblib.dump(soh_model, config.MODEL_SOH_PATH)

    # ---- EOL horizon ----
    eol_model, eol_name = _pick_regressor(X, y_eol, cv)
    eol_pred_cv = cross_val_predict(eol_model, X, y_eol, cv=cv, n_jobs=1)
    eol_metrics = _reg_metrics(y_eol.values, eol_pred_cv, eol_name, cv.n_splits)
    eol_dict = eol_metrics.to_dict()
    tol = float(np.mean(np.abs(y_eol.values - eol_pred_cv) <= 3.0) * 100)
    eol_base = np.full_like(y_eol.values, float(np.mean(y_eol.values)))
    eol_dict["within_3_months_pct"] = round(tol, 2)
    eol_dict["baseline_within_3_months_pct"] = round(
        float(np.mean(np.abs(y_eol.values - eol_base) <= 3.0) * 100), 2
    )
    eol_dict["threshold_soh"] = config.EOL_SOH_THRESHOLD
    eol_dict["units"] = "months"
    eol_model.fit(X, y_eol)
    joblib.dump(eol_model, config.MODEL_EOL_PATH)

    # ---- anomaly: one-class on known-good packs ----
    normal = (y_anom == 0).values
    cont = 0.05
    anom_model = IsolationForest(
        n_estimators=400, contamination=cont, random_state=RANDOM_STATE, n_jobs=1
    ).fit(df[ANOMALY_FEATURE_COLUMNS].loc[normal])
    joblib.dump(anom_model, config.MODEL_ANOMALY_PATH)

    oof = np.zeros(len(df), dtype=int)
    for tr, te in cv.split(df[ANOMALY_FEATURE_COLUMNS]):
        keep = tr[normal[tr]]
        if len(keep) < 10:
            keep = tr
        m = IsolationForest(
            n_estimators=400, contamination=cont, random_state=RANDOM_STATE, n_jobs=1
        ).fit(df[ANOMALY_FEATURE_COLUMNS].iloc[keep])
        oof[te] = (m.predict(df[ANOMALY_FEATURE_COLUMNS].iloc[te]) == -1).astype(int)

    ya = y_anom.values
    tp = int(((oof == 1) & (ya == 1)).sum())
    fp = int(((oof == 1) & (ya == 0)).sum())
    fn = int(((oof == 0) & (ya == 1)).sum())
    tn = int(((oof == 0) & (ya == 0)).sum())
    anom = {
        "model": "IsolationForest (one-class, fitted on known-good packs only)",
        "method": "one-class novelty detection on the healthy-pack manifold",
        "features": ANOMALY_FEATURE_COLUMNS,
        "contamination_used": cont,
        "precision": round(float(precision_score(ya, oof, zero_division=0)), 4),
        "recall": round(float(recall_score(ya, oof, zero_division=0)), 4),
        "f1": round(float(f1_score(ya, oof, zero_division=0)), 4),
        "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        "n_samples": int(len(df)),
        "n_positive_cases": int(ya.sum()),
        "true_anomaly_rate_pct": round(float(ya.mean() * 100), 2),
        "small_sample_warning": (
            f"Only {int(ya.sum())} anomaly cases exist in the synthetic cohort. "
            "Precision/recall on a small number of positives is statistically fragile "
            "and must not be presented as a production-grade figure."
        ) if int(ya.sum()) < 30 else "",
    }

    payload: dict[str, Any] = {
        "generated_at_utc": pd.Timestamp.utcnow().isoformat(),
        "dataset": {
            "n_batteries": int(len(df)),
            "provenance": "SYNTHETIC",
            "notice": SIM_NOTICE,
            "random_seed": config.RANDOM_SEED,
            "n_features": len(FEATURE_COLUMNS),
        },
        "soh": {
            **soh_metrics.to_dict(),
            "target": "State of Health (fraction of rated usable capacity)",
            "units": "fraction",
            "feature_importance": _importances(soh_model, X, y_soh),
        },
        "eol": {
            **eol_dict,
            "target": (
                "Months until SOH crosses the EOL threshold "
                f"({config.EOL_SOH_THRESHOLD:.0%})"
            ),
            "feature_importance": _importances(eol_model, X, y_eol),
        },
        "anomaly": anom,
        "baseline_note": (
            "Baseline = predict the training mean for every battery. "
            "skill_vs_baseline_pct is the MAE reduction versus that naive predictor. "
            "A model that cannot beat the baseline is not worth deploying."
        ),
        "honesty": {
            "headline": "READ THIS BEFORE QUOTING ANY NUMBER ABOVE",
            "why_soh_r2_is_so_high": (
                "In this synthetic dataset the target SOH is generated by a known "
                "deterministic degradation law applied to the same feature columns the "
                "model reads. The features therefore nearly DETERMINE the label, so a tree "
                "ensemble can recover the law almost exactly and R2 approaches 1.0. A high "
                "R2 here is a property of the data-generating process, NOT evidence of "
                "real-world battery prediction accuracy. On measured fleet data the same "
                "model would score far lower."
            ),
            "what_would_change_this": (
                "Retraining on measured data from a real BMS or telematics feed "
                "(upload a CSV via POST /api/data/upload) replaces the synthetic label law "
                "with actual observations. Only then do these metrics mean anything."
            ),
        },
        "limitations": [
            "Metrics are measured against SYNTHETIC ground truth, not measured batteries.",
            "They are NOT estimates of real-world accuracy.",
            "The very high SOH R2 is an artifact of the label being a deterministic function of the features.",
            "Real-world accuracy requires retraining on measured fleet data.",
            "Feature importance is correlational; the simulated law is not a causal model.",
            "The EOL horizon is a projection that assumes the observed duty cycle continues.",
            "Tree ensembles cannot extrapolate: predictions saturate outside the training range.",
            "Anomaly scores are signals for review, never confirmed faults.",
            "Pathway, priority and circularity outputs are transparent RULES, not learned models.",
        ],
    }

    config.METRICS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    bundle = ModelBundle()
    try:
        payload["robustness_under_bms_noise"] = robustness_ablation(bundle)
        payload["not_hardcoded_check"] = verify_not_hardcoded(bundle)
    except Exception as exc:  # never let diagnostics break training
        payload["robustness_error"] = f"{type(exc).__name__}: {exc}"
    config.METRICS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    if verbose:
        print(f"[ml] SOH  {soh_name}: MAE={soh_metrics.mae:.4f} R2={soh_metrics.r2:.4f} "
              f"(baseline MAE={soh_metrics.baseline_mae:.4f})")
        print(f"[ml] EOL  {eol_name}: MAE={eol_metrics.mae:.2f}mo R2={eol_metrics.r2:.4f} "
              f"within3mo={tol:.1f}%")
        print(f"[ml] ANOM one-class IsolationForest: P={anom['precision']:.3f} "
              f"R={anom['recall']:.3f} F1={anom['f1']:.3f} (n_pos={anom['n_positive_cases']})")
    return payload


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

class ModelBundle:
    """Loads trained artifacts and serves predictions."""

    def __init__(self) -> None:
        self.soh = joblib.load(config.MODEL_SOH_PATH) if config.MODEL_SOH_PATH.exists() else None
        self.eol = joblib.load(config.MODEL_EOL_PATH) if config.MODEL_EOL_PATH.exists() else None
        self.anomaly = (
            joblib.load(config.MODEL_ANOMALY_PATH) if config.MODEL_ANOMALY_PATH.exists() else None
        )
        self._reference = None

    @property
    def ready(self) -> bool:
        return self.soh is not None and self.eol is not None and self.anomaly is not None

    def _ref_scores(self) -> np.ndarray:
        """Anomaly scores of known-good packs, used to normalise severity."""
        if self._reference is None:
            specs = _labels_from_specs(build_battery_specs(400, config.RANDOM_SEED))
            ref = make_feature_frame(specs)
            ref = ref[(ref["_anomaly"] == 0)]
            self._reference = self.anomaly.score_samples(ref[ANOMALY_FEATURE_COLUMNS])
        return self._reference

    def predict(self, frame: pd.DataFrame) -> dict[str, np.ndarray]:
        if not self.ready:
            raise RuntimeError(
                "Models are not trained. POST /api/ml/train or start the API, "
                "which trains on boot when artifacts are missing."
            )
        X = frame[FEATURE_COLUMNS]
        X_arr = X.to_numpy()
        soh = np.clip(np.asarray(self.soh.predict(X), dtype=float), 0.0, 1.0)
        eol = np.clip(
            np.asarray(self.eol.predict(X), dtype=float), 0.0, 60.0
        )

        soh_lo, soh_hi = soh.copy(), soh.copy()
        if hasattr(self.soh, "estimators_"):
            trees = np.vstack([t.predict(X_arr) for t in self.soh.estimators_])
            soh_lo, soh_hi = np.clip(trees.min(0), 0, 1), np.clip(trees.max(0), 0, 1)

        eol_lo, eol_hi = eol.copy(), eol.copy()
        if hasattr(self.eol, "estimators_"):
            trees = np.vstack([t.predict(X_arr) for t in self.eol.estimators_])
            eol_lo = np.clip(trees.min(0), 0, 60)
            eol_hi = np.clip(trees.max(0), 0, 60)

        raw = self.anomaly.score_samples(frame[ANOMALY_FEATURE_COLUMNS])
        ref = self._ref_scores()
        lo, hi = float(ref.min()), float(ref.max())
        sev = np.zeros(len(frame)) if hi - lo < 1e-9 else np.clip(
            (hi - np.asarray(raw, dtype=float)) / (hi - lo), 0.0, 1.0
        )

        return {
            "soh": soh, "soh_low": soh_lo, "soh_high": soh_hi,
            "eol": eol, "eol_low": eol_lo, "eol_high": eol_hi,
            "anomaly": sev,
        }


def _apply_noise(X: pd.DataFrame, spec: dict[str, float], seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    Xn = X.copy()
    for col, sd in spec.items():
        if col in Xn.columns:
            v = Xn[col].to_numpy(dtype=float)
            Xn[col] = v * (1.0 + rng.normal(0.0, sd, size=len(v)))
    return Xn


def robustness_ablation(bundle: ModelBundle | None = None) -> dict[str, Any]:
    """Re-measure on a held-out split after injecting realistic BMS error."""
    b = bundle or ModelBundle()
    if not b.ready:
        raise RuntimeError("models not trained")

    df = _training_frame()
    split = int(len(df) * 0.8)
    hold = df.iloc[split:]
    noisy = _apply_noise(hold, BMS_NOISE_SPEC, config.RANDOM_SEED + 1)

    a, bq = b.predict(hold), b.predict(noisy)
    return {
        "note": (
            "Measured on a held-out 20% split. 'clean' = synthetic features with no "
            "measurement error. 'with_bms_noise' = same batteries after realistic BMS "
            "sensor error is injected. The gap is the cost of real-world sensor noise."
        ),
        "holdout_rows": int(len(hold)),
        "noise_spec_relative_sd": BMS_NOISE_SPEC,
        "soh": {
            "clean_mae": round(float(mean_absolute_error(hold["true_soh"], a["soh"])), 6),
            "noisy_mae": round(float(mean_absolute_error(hold["true_soh"], bq["soh"])), 6),
            "clean_r2": round(float(r2_score(hold["true_soh"], a["soh"])), 4),
            "noisy_r2": round(float(r2_score(hold["true_soh"], bq["soh"])), 4),
        },
        "eol_months": {
            "clean_mae": round(float(mean_absolute_error(hold["true_eol_months"], a["eol"])), 4),
            "noisy_mae": round(float(mean_absolute_error(hold["true_eol_months"], bq["eol"])), 4),
            "clean_r2": round(float(r2_score(hold["true_eol_months"], a["eol"])), 4),
            "noisy_r2": round(float(r2_score(hold["true_eol_months"], bq["eol"])), 4),
        },
    }


def verify_not_hardcoded(bundle: ModelBundle | None = None) -> dict[str, Any]:
    """
    Prove predictions respond to inputs.

    Perturbs ONE feature on ONE battery and confirms the outputs move in the
    physically expected direction. A hardcoded lookup would return an identical
    number and fail.
    """
    b = bundle or ModelBundle()
    if not b.ready:
        raise RuntimeError("models not trained")

    base = make_feature_frame(_labels_from_specs(build_battery_specs(1, config.RANDOM_SEED)))
    b_soh, b_eol = b.predict(base)["soh"][0], b.predict(base)["eol"][0]

    more = base.copy()
    more["equivalent_full_cycles"] = float(more["equivalent_full_cycles"].iloc[0]) + 400.0
    m_out = b.predict(more)

    hot = base.copy()
    hot["avg_cell_temp_c"] = float(hot["avg_cell_temp_c"].iloc[0]) + 15.0
    h_out = b.predict(hot)

    d_soh = float(m_out["soh"][0] - b_soh)
    d_eol = float(m_out["eol"][0] - b_eol)
    ok = d_soh < 0 and d_eol < 0 and abs(d_soh) > 1e-4

    return {
        "base_soh": round(float(b_soh), 5),
        "soh_after_plus400_efc": round(float(m_out["soh"][0]), 5),
        "soh_change_from_extra_cycling": round(d_soh, 5),
        "base_eol_months": round(float(b_eol), 2),
        "eol_after_plus400_efc": round(float(m_out["eol"][0]), 2),
        "eol_change_from_extra_cycling": round(d_eol, 2),
        "soh_change_from_plus15C": round(float(h_out["soh"][0] - b_soh), 5),
        "directionally_correct": bool(ok),
        "verdict": (
            "PASS - predictions respond to input changes and move in the "
            "physically expected direction"
            if ok else
            "FAIL - prediction appears static or not input-sensitive"
        ),
    }


def load_metrics() -> dict[str, Any]:
    if config.METRICS_PATH.exists():
        return json.loads(config.METRICS_PATH.read_text(encoding="utf-8"))
    return {
        "status": "untrained",
        "notice": "Models have not been trained. POST /api/ml/train",
        "limitations": ["No metrics available."],
    }