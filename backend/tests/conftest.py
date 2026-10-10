"""Shared fixtures: one trained model set and one seeded database per session."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import config  # noqa: E402
config.EMAIL_OTP_MODE = "test"
from app.database.base import Base, engine, init_db, session_scope  # noqa: E402
from app.data.demo_seed import seed_demo  # noqa: E402
from app.ml.trainer import ModelBundle, train_all  # noqa: E402
from app.services import fleet as fleet_mod  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def models():
    """Train once for the whole session."""
    init_db()
    if not ModelBundle().ready:
        train_all(verbose=False)
    assert ModelBundle().ready, "model training failed"
    return True


def _ensure_seeded() -> None:
    """
    Guarantee a populated database.

    Some tests deliberately empty the database (to exercise the 409 path), so
    every test that needs data re-checks and re-seeds rather than assuming the
    session fixture left rows behind. Without this, one test's cleanup silently
    breaks every test that runs after it.
    """
    init_db()
    from app.database.models import Battery, User
    from app.data.demo_seed import _seed_demo_users

    with session_scope() as db:
        if db.query(Battery).count() == 0:
            seed_demo(db, n=config.DEMO_FLEET_COUNT, reset=True)
        elif db.query(User).count() == 0:
            _seed_demo_users(db)
    fleet_mod.invalidate()
    fleet_mod.load_records(force=True)


@pytest.fixture(scope="session")
def seeded_db(models):
    _ensure_seeded()
    return True


@pytest.fixture()
def db(seeded_db):
    _ensure_seeded()
    with session_scope() as s:
        yield s


@pytest.fixture()
def client(seeded_db):
    from fastapi.testclient import TestClient

    from app.main import app

    _ensure_seeded()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def baseline(db):
    from app.services import analytics

    _ensure_seeded()
    with session_scope() as s:
        return analytics.build_baseline(s, force=True)


@pytest.fixture()
def no_genai_key(monkeypatch):
    monkeypatch.setattr(config, "GENAI_API_KEY", "")
    return True