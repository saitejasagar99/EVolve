# EVolve AI — Redesign Plan (PS4: Intelligent Waste Management)

## 1. What already exists (inspected, not assumed)

Working project at `evolve-audit/` built earlier in this session. 132 backend tests passing.

| Module | State | Decision |
|---|---|---|
| `app/models.py` | Real sklearn: RF/GBR SOH + RUL, one-class IsolationForest, CV metrics, baselines, robustness ablation, `verify_not_hardcoded()` | **REUSE ML core.** Proven, honest, tested. |
| `app/risk.py` | Explainable *additive* factor scoring with exact reconciliation | **REUSE pattern** for prevention scoring |
| `app/decisions.py` | Line-item cost reconciliation (`total == sum(items)+downtime`) | **REUSE pattern** for intervention economics |
| `app/budget.py` | Hard budget contract, 8 scenarios incl. hostile budgets | **REUSE pattern** for capacity constraints |
| `app/genai.py` | Grounded facts dict + deterministic fallback + numeric-grounding test | **REUSE heavily** |
| `app/data_gen.py` | Vehicles, no batteries/lifecycle/zones/time-series | **REPLACE** — needs battery + lifecycle + zone model |
| `app/pipeline.py` | In-memory cache | **REPLACE** with SQLAlchemy services |
| `app/main.py` | Old endpoint surface | **REWRITE** |
| `backend/tests/` | 132 tests across 13 checks | **KEEP + EXTEND** |
| `frontend/src` | JS + hand-rolled SVG | **REPLACE** with TS + Tailwind + Recharts + Router |

Nothing working is being thrown away. The ML core, the four engine patterns and the
entire test approach are carried forward.

## 2. Repositioning

Old: "predictive maintenance dashboard" (battery health).
New: **"Intelligent EV Battery Waste Management & Circularity Decision Platform"**.

Old narrative: predict SOH/RUL → recommend repair or replace.
New narrative: **PREDICT → PREVENT → OPTIMIZE → TRACE**.

The key behavioural change: a degraded battery is **not** automatically waste. Each
battery is routed through a lifecycle pathway decision (continue / repair-refurbishment /
second-life assessment / EOL candidate) before anything is called waste.

## 3. Backend build order

1. `config.py` — extend paths + thresholds
2. `database/base.py` + `database/models.py` — SQLAlchemy, SQLite, 16 tables
3. `data/demo_seed.py` — 75 batteries, zones, handlers, readings, lifecycle events
4. `ml/` — lift models.py, retarget to SOH / EOL-horizon / anomaly
5. `services/` — 12 services, one per module group
6. `api/routes.py` + `main.py` — required endpoint surface
7. `tests/` — extend the existing check-based suite

## 4. Integrity rules carried over (non-negotiable)

- No hardcoded metric anywhere in UI or API. Everything computed per request.
- ML metrics measured by CV at train time, always shipped with a naive baseline
  and an explicit statement that they are measured against **simulated** labels.
- Synthetic data labelled in the banner, the API, and the CSV export.
- Risk/score factors must reconcile exactly with the score they explain.
- Budget/capacity contracts asserted across hostile scenarios, not just the happy path.
- GenAI receives only a facts dict; a test extracts every number from the output and
  requires it to exist in the facts.
- Forbidden claims kept out: certified safety, guaranteed RUL, official CPCB/EPR
  compliance, "first system", confirmed-fault-from-anomaly.

## 5. Frontend build order

Shell + router + design system → Dashboard (KPI + 6 charts) → Fleet → Battery detail
(health, prevention, lifecycle timeline) → Forecast → Prevention → Collection →
Optimizer → Capacity → Circularity → Simulator → Digital twin → Action plan →
Upload → Methodology → About.

Light theme, emerald accents, Recharts fed strictly by API payloads.

## 6. Risks

- **R² near 1.0 on synthetic data.** Unavoidable when the label is a deterministic
  function of the features. Mitigation: state it as an artifact in the API, the UI and
  the methodology page, and pair it with the BMS-noise robustness ablation.
- **Rules-based engines look "made up".** Mitigation: every threshold is a named
  constant, every rule is returned in the API response, and each engine ships its own
  reconciliation test.
- **Scope.** 15 modules. Mitigation: P0 first (forecast, prevention, collection,
  lifecycle), P1 next (circularity, capacity, simulator), P2 last (GenAI polish).