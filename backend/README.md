# EVolve AI — backend

FastAPI + SQLAlchemy + scikit-learn. Runs entirely locally: SQLite, no cloud service,
no API key required.

## Run

```powershell
cd "...\evolve-audit\backend"
$PY = "C:\Users\Nithisha\AppData\Local\Programs\Python\Python312\python.exe"

& $PY -m pip install -r requirements.txt
& $PY -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The full interpreter path is used because this machine's Python `Scripts\` directory is
not on `PATH`, so bare `uvicorn` and `pytest` are unavailable.

## First start

The startup hook runs, in order:

1. `init_db()` — create all tables (safe to repeat).
2. Train the SOH / EOL / anomaly models **if no artifacts exist** (30–90 s). Later
   starts load `artifacts/*.joblib` in about a second.
3. Seed 75 synthetic batteries **if the database is empty**.
4. Warm the analysis cache.

## Tests

```powershell
& $PY -m pytest tests -q          # 180 tests
& $PY -m pytest tests -q -k integrity   # honesty / contract checks only
```

## Layout

| Path | Responsibility |
|---|---|
| `app/main.py` | App, CORS, startup sequence |
| `app/config.py` | Paths, thresholds, capacity, optional GenAI |
| `app/api/routes.py` | HTTP surface, shared filters, error handling |
| `app/api/ingest.py` | CSV → database |
| `app/database/` | Engine/session + 16 ORM tables |
| `app/data/demo_seed.py` | Synthetic dataset and degradation law |
| `app/ml/trainer.py` | Training, inference, metrics, robustness |
| `app/schemas/` | Pydantic models |
| `app/services/` | One module per product area |

## Design notes worth knowing

**Scored quantities reconcile with their own explanations.** Data confidence, collection
priority and circularity score all return the component breakdown that produced them, and
tests assert the parts sum to the total. An operator can audit any number from the response
alone.

**The prevention engine is a transparent ruleset, not a learned model.** Every pathway
decision returns `rules_fired` with the rule name, the statement and the evidence used.
That is deliberate — an operator must be able to challenge the rule that sent their battery
down a pathway.

**`services/analytics.py` composes every module once.** The dashboard, the digital twin and
the simulator all compare against that single baseline, so the three can never disagree.

**Results are cached per dataset version.** The models are deterministic, so recomputing
per request would add latency without changing a number. The cache key is a cheap
row-count + timestamp + data-source fingerprint.

**Unknown query parameters are silently ignored by FastAPI.** That once made four UI
filters dead controls with no error, so `routes.py` has a single `_apply_filters()` shared
by both listing endpoints, and `test_api.py` asserts every filter works on both.