"""
EVolve AI - Intelligent EV Battery Waste Management and Circularity Platform.

PREDICT -> PREVENT -> OPTIMIZE -> TRACE

Runs fully locally: SQLite, no cloud service, no API key required.
GenAI is optional and falls back to a deterministic local explainer.

Start:  python -m uvicorn app.main:app --port 8000
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .api.routes import router
from .api.customer_routes import router as customer_router, consumer_router, manufacturer_router
from .api.recycling_routes import router as recycling_router
from .api.recycler_routes import router as recycler_router
from .api.fleet_routes import router as fleet_router
from .api.auth_routes import admin_router, auth_router, profile_router
from .database.base import init_db, session_scope
from .data.demo_seed import seed_demo
from .services import fleet as fleet_mod

logger = logging.getLogger("evolve")

app = FastAPI(
    title="EVolve AI",
    description=(
        "Intelligent EV Battery Waste Management and Circularity Decision Platform. "
        "PREDICT -> PREVENT -> OPTIMIZE -> TRACE. Decision-support only: not a safety "
        "certification and not a regulatory compliance determination."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # Local demo: the frontend is served separately on 5173.
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:4173", "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(admin_router)
app.include_router(router)
app.include_router(customer_router)
app.include_router(recycling_router)
app.include_router(consumer_router)
app.include_router(recycler_router)
app.include_router(fleet_router)
app.include_router(manufacturer_router)



@app.on_event("startup")
def _startup() -> None:
    from .ml.trainer import ModelBundle

    logger.info("EVolve AI starting")

    init_db()

    if not ModelBundle().ready:
        logger.warning("no trained model artifacts - training now (30-90s on first run)")
        try:
            from .ml.trainer import train_all

            train_all(verbose=True)
        except Exception:
            logger.exception("model training failed; the API will start but ML routes will 503")

    # Auto-seed an empty database so the demo works with zero manual steps.
    with session_scope() as db:
        from .database.models import Battery, User
        from .data.demo_seed import _seed_demo_users

        if db.query(Battery).count() == 0:
            logger.info("empty database - seeding synthetic demo fleet")
            seed_demo(db, n=config.DEMO_FLEET_COUNT, reset=True)
        elif db.query(User).count() == 0:
            logger.info("seeding demo accounts")
            _seed_demo_users(db)

    fleet_mod.invalidate()
    fleet_mod.load_records(force=True)
    logger.info("EVolve AI ready on %s:%s", config.API_HOST, config.API_PORT)


@app.get("/")
def root() -> dict:
    return {
        "app": "EVolve AI",
        "tagline": "Predict. Prevent. Optimize. Trace.",
        "positioning": "Intelligent EV Battery Waste Management and Circularity Decision Platform",
        "docs": "/docs",
        "health": "/api/health",
        "important": (
            "Demo data is SYNTHETIC and labelled as such on every response. "
            "Decision-support only: not a safety certification and not a regulatory "
            "compliance determination."
        ),
    }