"""SQLAlchemy engine/session wiring.

Portability note
----------------
Only two dialect-specific decisions exist, both isolated here:

1. the connection URL, and
2. `check_same_thread=False` on SQLite so FastAPI's threadpool can share a
   connection.

No column type, constraint or query in the codebase is SQLite-specific, so
moving to PostgreSQL is a DATABASE_URL change plus an Alembic migration.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .. import config

_is_sqlite = config.DATABASE_URL.startswith("sqlite")

engine: Engine = create_engine(
    config.DATABASE_URL,
    future=True,
    echo=False,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - driver hook
        cur = dbapi_conn.cursor()
        # WAL lets the API read while a write is in flight; FK enforcement is
        # off by default in SQLite and the schema relies on it.
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for scripts, seeding and background work."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Create every table. Safe to call repeatedly."""
    from . import models  # noqa: F401  (ensure metadata is populated)

    Base.metadata.create_all(bind=engine)

    # In SQLite, ensure optional columns added to existing tables exist
    if _is_sqlite:
        with engine.begin() as conn:
            try:
                cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
                if cols:
                    if "city" not in cols:
                        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN city VARCHAR(80)")
                    if "state" not in cols:
                        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN state VARCHAR(80)")
                    if "pincode" not in cols:
                        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN pincode VARCHAR(16)")
                    if "intended_application" not in cols:
                        conn.exec_driver_sql("ALTER TABLE users ADD COLUMN intended_application VARCHAR(120)")
            except Exception:
                pass

            try:
                bat_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(batteries)").fetchall()]
                if bat_cols:
                    if "user_id" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN user_id INTEGER REFERENCES users(id)")
                    if "vehicle_manufacturer" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN vehicle_manufacturer VARCHAR(64)")
                    if "vehicle_model" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN vehicle_model VARCHAR(120)")
                    if "purchase_year" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN purchase_year INTEGER")
                    if "odometer_km" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN odometer_km FLOAT")
                    if "city" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN city VARCHAR(80)")
                    if "state" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN state VARCHAR(80)")
                    if "sharing_status" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN sharing_status VARCHAR(48) DEFAULT 'PRIVATE'")
                    if "sharing_consent" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN sharing_consent BOOLEAN DEFAULT 0")
                    if "second_life_suitability" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN second_life_suitability VARCHAR(48) DEFAULT 'NOT_ASSESSED'")
                    if "estimated_remaining_years" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN estimated_remaining_years FLOAT")
                    if "future_risk" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN future_risk VARCHAR(32)")
                    if "reported_condition" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN reported_condition VARCHAR(64)")
                    if "updated_at" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN updated_at DATETIME")
                    if "eol_reported_at" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN eol_reported_at DATETIME")
                    if "eol_reason" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN eol_reason VARCHAR(255)")
                    if "is_professionally_assessed" not in bat_cols:
                        conn.exec_driver_sql("ALTER TABLE batteries ADD COLUMN is_professionally_assessed BOOLEAN DEFAULT 0")
            except Exception:
                pass


def reset_db() -> None:
    """
    Drop and recreate every table. Used by the demo loader so a reload is
    idempotent.

    Foreign keys are disabled for the drop: SQLite refuses to drop a parent
    table while child rows still reference it, even with `drop_all`.
    """
    from . import models  # noqa: F401

    if _is_sqlite:
        with engine.begin() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
    Base.metadata.drop_all(bind=engine)
    init_db()
    if _is_sqlite:
        with engine.begin() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")