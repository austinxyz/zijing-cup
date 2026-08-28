"""Schema-level tests for the competition-rules tables.

These talk to a real Postgres — the local Supabase stack (`supabase start`
from the repo root). The thing under test IS the schema, so a mocked session
would assert nothing: the failure this guards against is DDL landing in
`public` instead of `zijing_cup`, and only the database knows where a table
actually went.

The remote Supabase project is shared with an unrelated app that owns
`public`; see CLAUDE.md for why migrations are never pushed there with the
CLI.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import pytest
from sqlmodel import Session, text

from app.db import SCHEMA, engine

RULES_TABLES = {
    "seasons",
    "divisions",
    "division_lines",
    "division_eligibility_limits",
}


@pytest.fixture(scope="module")
def session():
    with Session(engine) as s:
        yield s


def _tables_in(session: Session, schema: str) -> set[str]:
    rows = session.execute(
        text(
            "select table_name from information_schema.tables "
            "where table_schema = :schema"
        ),
        {"schema": schema},
    )
    return {row[0] for row in rows}


def test_every_rules_table_exists_in_the_dedicated_schema(session):
    present = _tables_in(session, SCHEMA)
    missing = RULES_TABLES - present
    assert not missing, f"missing from {SCHEMA}: {sorted(missing)}"


def test_no_rules_table_leaked_into_public(session):
    # The whole point of the search_path discipline. A `create table` without
    # a schema qualifier runs as `postgres`, whose default search_path does
    # not include zijing_cup — it would silently land here, in the other
    # app's schema.
    leaked = RULES_TABLES & _tables_in(session, "public")
    assert not leaked, f"leaked into public: {sorted(leaked)}"


def test_line_cap_is_nullable_so_open_lines_are_representable(session):
    # Gold's D1 and MD have no UTR ceiling. That is a different kind of line,
    # not a very large cap — the column has to be able to say "no limit".
    nullable = session.execute(
        text(
            "select is_nullable from information_schema.columns "
            "where table_schema = :schema and table_name = 'division_lines' "
            "and column_name = 'cap'"
        ),
        {"schema": SCHEMA},
    ).scalar_one()
    assert nullable == "YES"


def test_line_points_is_not_nullable(session):
    # Every line carries a score weight, including the open ones (1 point in
    # gold). Silver ignores it, but it is never absent.
    nullable = session.execute(
        text(
            "select is_nullable from information_schema.columns "
            "where table_schema = :schema and table_name = 'division_lines' "
            "and column_name = 'points'"
        ),
        {"schema": SCHEMA},
    ).scalar_one()
    assert nullable == "NO"


def test_division_stores_both_buffer_allowances(session):
    # Per-line maximum and whole-team total are two separate constraints in
    # the rules text. They happen to be equal in 2026 for both divisions;
    # collapsing them into one column would assert they always are.
    columns = {
        row[0]
        for row in session.execute(
            text(
                "select column_name from information_schema.columns "
                "where table_schema = :schema and table_name = 'divisions'"
            ),
            {"schema": SCHEMA},
        )
    }
    assert {"buffer_per_line", "buffer_total"} <= columns


def test_eligibility_limit_can_restrict_to_specific_lines(session):
    # Gold: "UTR>9.0 男队员不超过 1 名，且只能打第一男双或混双" — one rule
    # carrying both a headcount cap and a line whitelist.
    row = session.execute(
        text(
            "select data_type, is_nullable from information_schema.columns "
            "where table_schema = :schema "
            "and table_name = 'division_eligibility_limits' "
            "and column_name = 'restricted_to_lines'"
        ),
        {"schema": SCHEMA},
    ).one()
    data_type, is_nullable = row
    assert data_type == "ARRAY"
    # NULL means "any line", which is what every silver limit needs.
    assert is_nullable == "YES"
