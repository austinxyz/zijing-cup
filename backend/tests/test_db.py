import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from app.db import SCHEMA, engine, normalize_database_url


def test_normalize_database_url_rewrites_bare_postgres_scheme():
    assert (
        normalize_database_url("postgres://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_normalize_database_url_rewrites_bare_postgresql_scheme():
    assert (
        normalize_database_url("postgresql://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_normalize_database_url_leaves_driver_qualified_url_alone():
    url = "postgresql+psycopg://u:p@host:5432/db"
    assert normalize_database_url(url) == url


def test_schema_is_zijing_cup():
    assert SCHEMA == "zijing_cup"


def test_engine_search_path_targets_the_dedicated_schema():
    # The engine must route every unqualified table reference to zijing_cup
    # first, and fall back to public only for extensions/shared objects —
    # never the other way around, or a query here could silently read the
    # other app's rows in the shared Supabase project.

    # Check if search_path is in the URL query (would indicate URL-based approach)
    options = engine.url.query.get("options", "") if engine.url.query else ""

    if not options:
        # With connect_args approach, check the pool's creator function closure
        # The creator is a function that captures connection args in its closure
        creator = engine.pool._creator
        if creator.__closure__:
            # The connect_args are in a dictionary in the closure (usually at index 1)
            for cell in creator.__closure__:
                cell_content = cell.cell_contents
                if isinstance(cell_content, dict) and "options" in cell_content:
                    options = cell_content.get("options", "")
                    break

        assert options, "search_path not found in URL query or connect_args"

    assert f"-csearch_path={SCHEMA},public" in options
