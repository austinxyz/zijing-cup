"""Schema-level tests for the team/roster tables.

Like test_rules_model.py these talk to the real local Postgres, because the
thing under test IS the schema: nullability here encodes rule states, and
only the database knows what it actually enforces.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

import pytest
from sqlmodel import Session, text

from app.db import SCHEMA, engine

ROSTER_TABLES = {"teams", "roster_entries"}


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


def _nullability(session: Session, table: str) -> dict[str, str]:
    rows = session.execute(
        text(
            "select column_name, is_nullable from information_schema.columns "
            "where table_schema = :schema and table_name = :table"
        ),
        {"schema": SCHEMA, "table": table},
    )
    return {row[0]: row[1] for row in rows}


def test_roster_tables_exist_in_the_dedicated_schema(session):
    missing = ROSTER_TABLES - _tables_in(session, SCHEMA)
    assert not missing, f"missing from {SCHEMA}: {sorted(missing)}"


def test_no_roster_table_leaked_into_public(session):
    leaked = ROSTER_TABLES & _tables_in(session, "public")
    assert not leaked, f"leaked into public: {sorted(leaked)}"


def test_source_owned_columns_are_required(session):
    # These come from the committee CSV on every row. A NULL here would mean
    # the importer wrote a record it could not actually read.
    nullability = _nullability(session, "roster_entries")
    for column in ("last_name", "first_name", "match_utr", "dutr_status"):
        assert nullability.get(column) == "NO", column


def test_human_owned_columns_are_nullable(session):
    # Three columns the committee sheet cannot supply: the borrowed-player
    # flag, the UTR profile link, and the rating class for Unrated players.
    # Each has to be able to say "nobody has filled this in yet".
    nullability = _nullability(session, "roster_entries")
    for column in ("rating_class", "utr_profile_id", "is_borrowed_player"):
        assert nullability.get(column) == "YES", column


def test_source_note_is_nullable(session):
    # Most rows carry no Notes value; an empty one is ordinary, not an error.
    assert _nullability(session, "roster_entries").get("source_note") == "YES"


def test_borrowed_player_flag_has_no_default(session):
    # Deliberately three-state. A `not null default false` would render
    # "nobody has marked this" as "confirmed not a borrowed player", and the
    # rules cap borrowed players per team and per match — downstream would
    # compute a result that looks checked and is not.
    default = session.execute(
        text(
            "select column_default from information_schema.columns "
            "where table_schema = :schema and table_name = 'roster_entries' "
            "and column_name = 'is_borrowed_player'"
        ),
        {"schema": SCHEMA},
    ).scalar_one()
    assert default is None


def test_daily_utrs_is_an_array(session):
    data_type = session.execute(
        text(
            "select data_type from information_schema.columns "
            "where table_schema = :schema and table_name = 'roster_entries' "
            "and column_name = 'daily_utrs'"
        ),
        {"schema": SCHEMA},
    ).scalar_one()
    assert data_type == "ARRAY"


def test_team_is_scoped_to_a_season_and_division(session):
    columns = set(_nullability(session, "teams"))
    assert {"season_year", "division_code", "code"} <= columns
