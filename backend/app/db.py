import logging
import os

from dotenv import load_dotenv
from sqlmodel import Session, create_engine, text

# Local development reads backend/.env; deployed environments inject the
# variable directly and have no such file, so this is a no-op there.
load_dotenv()

logger = logging.getLogger(__name__)

# Every table this project owns lives here, never in `public` — this
# Supabase project is shared with an unrelated app that already occupies
# `public`. Putting `zijing_cup` first (before `public`) in search_path
# means an unqualified table name resolves to ours; `public` stays in the
# path only so shared extensions (e.g. pgcrypto) remain reachable.
SCHEMA = "zijing_cup"


def normalize_database_url(url: str) -> str:
    """Pin the connection string to the psycopg v3 driver.

    Supabase's console hands out `postgresql://…`. SQLAlchemy reads that bare
    scheme as "use psycopg2", which this project does not install — the app
    would crash on startup with ModuleNotFoundError. Rewriting the scheme here
    keeps a driver-selection detail from leaking into deployment config.

    `postgres://` gets the same treatment: it is a legacy spelling SQLAlchemy
    no longer accepts at all.

    Only the scheme changes; host, port, credentials and database name are
    left untouched. A URL that already names a driver is returned as-is.
    """
    for bare_scheme in ("postgresql://", "postgres://"):
        if url.startswith(bare_scheme):
            return "postgresql+psycopg://" + url[len(bare_scheme) :]
    return url


def resolve_database_url() -> str:
    """Read DATABASE_URL from the environment, or refuse to start.

    There is deliberately no localhost fallback. A default would make a
    deployment that forgot to set DATABASE_URL *look* healthy — the process
    boots, the platform's health check passes — and then fail on every
    request. Better to stop at startup and name the missing variable.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. For local development, copy "
            "backend/.env.example to backend/.env (the Supabase CLI's local "
            "stack is already filled in there). For a deployed environment, "
            "set it in the platform's environment variables."
        )
    return normalize_database_url(url)


DATABASE_URL = resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    connect_args={"options": f"-csearch_path={SCHEMA},public"},
)


def get_session():
    with Session(engine) as session:
        yield session


def check_db_connection() -> bool:
    """Round-trip one trivial query to prove the app can actually reach
    Postgres — not just that a URL was configured. Used by /health.

    Returns False (never raises) on any failure, so a DB outage surfaces as
    {"status": "ok", "db": "error"} with a 200, not a 500 — a 500 here would
    make Render restart an otherwise-healthy process during a transient blip.
    """
    try:
        with Session(engine) as session:
            session.execute(text("SELECT 1"))
        return True
    except Exception:
        logger.exception("Database health check failed")
        return False
