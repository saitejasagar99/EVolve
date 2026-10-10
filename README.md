# EVolve AI

**Predictive EV Battery Waste Prevention & Circularity Intelligence**
*"Predict. Prevent. Optimize. Trace."*

An intelligent **EV battery waste management and circularity decision platform** built for
**PS4 — Intelligent Waste Management**.

EVolve AI answers the questions a fleet operator actually has about batteries that are
heading toward end-of-life:

1. Which batteries are likely to become waste in the future?
2. **Which of those can still be prevented from becoming waste?**
3. Which should be prioritised for EOL collection?
4. Can collection activities be intelligently batched?
5. Is recycling capacity sufficient for predicted EOL volume?
6. Where is each battery in its lifecycle?
7. How much waste can be avoided through intervention?
8. What happens if fleet size, repair capacity or recycling capacity changes?

> A degraded battery is **not** automatically waste. Every pack is routed through an ordered
> set of lifecycle pathways — continue use → repair/refurbishment → second-life assessment →
> EOL collection — before it is called end-of-life.

---

## Quick start (Windows PowerShell)

Two terminals. Python 3.12 and Node 18+ are the only prerequisites.

### Terminal 1 — backend

```powershell
cd "C:\Users\Nithisha\OneDrive\Documents\Default Project\evolve-audit\backend"

# Use the full interpreter path (Scripts\ is not on PATH on this machine)
$PY = "C:\Users\Nithisha\AppData\Local\Programs\Python\Python312\python.exe"

& $PY -m pip install -r requirements.txt
& $PY -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

First start creates the SQLite database, seeds 75 synthetic batteries, and trains the
models (30–90 s). Later starts load the saved artifacts in about a second.

### Terminal 2 — frontend

```powershell
cd "C:\Users\Nithisha\OneDrive\Documents\Default Project\evolve-audit\frontend"

npm install
npm run dev
```

### Open

| | |
|---|---|
| App | **http://127.0.0.1:5173** |
| API docs | **http://127.0.0.1:8000/docs** |
| Health | http://127.0.0.1:8000/api/health |

> Use `127.0.0.1`, not `localhost`. Vite is bound to IPv4 deliberately, because on Windows
> `localhost` resolves to `::1` and the browser will fail to connect.

### No API key required

The GenAI layer is optional. With no key configured the app uses a deterministic local
explainer and reports `GenAI: local fallback` in the header. To enable an external model:

```powershell
$env:GENAI_API_KEY = "your-key"
$env:GENAI_MODEL  = "gemini-2.0-flash"
```

---

## Running the tests

```powershell
cd "...\evolve-audit\backend"
$PY = "C:\Users\Nithisha\AppData\Local\Programs\Python\Python312\python.exe"

# 180 backend tests
& $PY -m pytest tests -q

# frontend type-check + production build
cd "..\frontend"
npm run build
```

---

## Project structure

```
evolve-audit/
├── backend/
│   ├── app/
│   │   ├── main.py                  FastAPI app, CORS, startup (init → train → seed)
│   │   ├── config.py                Paths, thresholds, capacity, optional GenAI
│   │   ├── api/
│   │   │   ├── routes.py            HTTP surface, shared filters, error handling
│   │   │   └── ingest.py            CSV → database import
│   │   ├── database/
│   │   │   ├── base.py              Engine/session (PostgreSQL-portable)
│   │   │   └── models.py            16 SQLAlchemy tables
│   │   ├── data/demo_seed.py        Deterministic synthetic dataset + degradation law
│   │   ├── ml/trainer.py            SOH + EOL regressors, one-class anomaly, metrics
│   │   ├── schemas/models.py        Pydantic request/response models
│   │   └── services/
│   │       ├── analytics.py         Orchestrates every module
│   │       ├── fleet.py             DB → models bridge, caching
│   │       ├── quality.py           M1  Data confidence
│   │       ├── battery_intelligence.py M2  SOH, trend, RUL, anomaly
│   │       ├── forecasting.py       M3  Future waste forecast
│   │       ├── prevention.py        M4+M5  Pathway engine & avoidance ledger
│   │       ├── collection.py        M6+M7  Priority queue & smart batching
│   │       ├── capacity.py          M8   Capacity gap planning
│   │       ├── traceability.py      M9+M10 Lifecycle timeline & blind spots
│   │       ├── circularity.py       M11  Circularity score
│   │       ├── simulator.py         M12+M13 What-if & digital twin
│   │       ├── action_plan.py       M14  Action plan
│   │       └── genai.py             M15  Grounded explanation + fallback
│   ├── tests/                       180 tests
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── components/  Layout, ui, charts, AppContext
│   │   ├── pages/       Dashboard, Fleet, Collection, Planning, Insight, Upload
│   │   ├── services/    api.ts (typed client)
│   │   ├── types/       api.ts (backend contracts)
│   │   └── lib/         format.ts (INR, %, months)
│   ├── package.json
│   └── README.md
├── docs/REDESIGN_PLAN.md
├── README.md
└── .env.example
```

---

## The 15 modules

| # | Module | What it does |
|---|---|---|
| 1 | Data Quality & Confidence | Five weighted dimensions → confidence score. Insufficient history **blocks** the forecast rather than guessing. |
| 2 | Battery Intelligence | SOH, degradation trend, estimated EOL horizon, anomaly score, thermal history. Supporting only. |
| 3 | Future Waste Forecast | 3 / 6 / 12-month EOL candidates, monthly curve, zone and chemistry breakdown. |
| 4 | **Waste Prevention** | **The differentiator.** Ordered pathway cascade with the exact rules that fired. |
| 5 | Waste Avoidance Ledger | Fleet-level retained vs EOL counts and estimated economics. |
| 6 | EOL Collection Priority | Weighted, self-reconciling priority score per pack. |
| 7 | Smart Collection Batching | Zone-clustered, capacity-feasible trips with distance saved vs solo visits. |
| 8 | Capacity Planning | Predicted inflow vs downstream handler capacity, with the gap. |
| 9 | Lifecycle Traceability | Append-only audit trail keyed by Battery Lifecycle ID. |
| 10 | Environmental Blind Spots | Five deterministic consistency checks over the record set. |
| 11 | Circularity Score | Five weighted components; recalculable by hand from the response. |
| 12 | What-if Simulator | Seven live parameters → recomputed waste, collection and circularity. |
| 13 | Digital Twin | Six named scenarios through the same models and rules. |
| 14 | Action Plan | Immediate / 30-day / 6-month worklists, each naming its batteries. |
| 15 | GenAI Explanation | Explains backend numbers only; deterministic fallback with no key. |

## Pages

Dashboard · Fleet Overview · Battery Intelligence · Battery Detail · Future Waste Forecast ·
Waste Prevention · EOL Collection · Collection Optimizer · Circularity & Traceability ·
Capacity Planning · What-if Simulator · Digital Twin · Action Plan · Data Upload ·
Methodology · About

---

## API

```
POST /api/demo/load                    Load synthetic demo fleet
POST /api/data/upload                  Upload operator CSV
GET  /api/demo/template.csv            Download a valid CSV template

GET  /api/fleet/summary                Dashboard KPIs
GET  /api/fleet/vehicles               Filtered battery list
GET  /api/vehicles/{id}                Vehicle detail
GET  /api/vehicles/{id}/health         Per-battery intelligence
GET  /api/vehicles/{id}/rul            EOL horizon
GET  /api/vehicles/{id}/anomaly        Anomaly status + wording
GET  /api/vehicles/{id}/lifecycle      Lifecycle timeline
GET  /api/batteries                    Filtered battery list
GET  /api/batteries/{id}               Battery detail + pathway + lifecycle
GET  /api/batteries/{id}/lifecycle     Lifecycle timeline

GET  /api/waste/forecast               M3
GET  /api/waste/avoidance              M5
POST /api/waste/prevention             M4 (fleet or single battery)
POST /api/waste/intervention/{id}      Record an operator decision

GET  /api/collection/prioritize        M6
POST /api/collection/batch             M7
GET  /api/collection/capacity          M8

GET  /api/circularity/score            M11
GET  /api/traceability/blind-spots     M10
GET  /api/traceability/summary         M9 overview

POST /api/simulator/run                M12
GET  /api/simulator/scenarios          Preset scenarios
GET  /api/digital-twin/baseline        M13

GET  /api/action-plan                  M14
POST /api/reports/explain              M15

GET  /api/ml/metrics                   Measured CV metrics + baselines
GET  /api/ml/verify                    Proof predictions are input-sensitive
GET  /api/ml/robustness                Performance under injected BMS noise
POST /api/ml/train                     Retrain

GET  /api/health  ·  GET /api/meta  ·  GET /api/reports/fleet.csv
```

Interactive API docs: **http://127.0.0.1:8000/docs**

---

## Integrity: what is and is not claimed

**Stated everywhere, in code and in the UI:**

- Demo data is **synthetic**, labelled on every API response, in the persistent UI banner,
  and in the `DATA_PROVENANCE` column of every CSV export.
- All metrics are **computed by cross-validation at training time**. None is a literal.
- Every metric ships with a **naive baseline** (predict the training mean).
- Anomaly scores are **signals requiring inspection**, never confirmed faults.
- Second-life recommendations **require technical assessment**. No fitness is certified.
- Circularity is an **internal operational indicator**, not a recognised regulatory metric.
- Traceability is **EPR-ready evidence**, not official compliance.

**Explicitly not claimed:** guaranteed RUL or failure dates · certified safe/unsafe ·
official CPCB or EPR compliance · that this is the first system of its kind · that no
existing solutions exist.

### The R² caveat, stated plainly

The SOH model's R² is around 0.99. **That is a property of the synthetic data-generating
process, not evidence of real-world accuracy.** The target SOH is produced by a known
deterministic law applied to the same feature columns the model reads, so the features
nearly *determine* the label. `GET /api/ml/metrics` and the Methodology page both say this
in full, and `GET /api/ml/robustness` re-measures performance after injecting realistic BMS
sensor error so the gap is visible.

---

## Limitations

1. **All accuracy figures are synthetic.** Real-world accuracy requires retraining on
   measured fleet data. The upload path exists for exactly this.
2. **Degradation coefficients are documented assumptions**, not values fitted to a specific
   cell chemistry or manufacturer's datasheet.
3. **Cost figures are a single editable basis** (`UNIT_COSTS_INR`, `TRIP_BASE_COST_INR`),
   not quotes. Replace them with real numbers before any financial decision.
4. **Map is schematic.** Zone coordinates are illustrative; no external map API is used.
5. **The digital twin resamples existing profiles.** It does not model new battery designs,
   chemistry shifts, or market behaviour.
6. **Unverified-handler status is a supply-chain risk signal**, not a compliance judgement.
7. **Tree ensembles cannot extrapolate** beyond the training range — a far-worse pack than
   anything in training saturates rather than extrapolating linearly.

---

## Portability

SQLite is used for demo reliability. Migration to PostgreSQL is a `DATABASE_URL` change:
no dialect-specific column type, constraint or query exists, and the only SQLite-specific
lines are documented in `database/base.py`.

Environment variables (all optional — see `.env.example`):

```
API_HOST=127.0.0.1
API_PORT=8000
DATABASE_URL=sqlite:///./evolve.db
DEMO_FLEET_COUNT=75
EVALUATION_COHORT_SIZE=1200
GENAI_API_KEY=
GENAI_MODEL=gemini-2.0-flash
```