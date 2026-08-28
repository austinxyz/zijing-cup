"""The ORM mappings must round-trip the rule states the schema allows.

Separate from test_rules_model.py, which inspects the schema itself. These
tests go through SQLModel, because that is how the seed importer and the API
will touch these tables — a mapping that silently coerces a NULL cap to 0
would pass every schema test and still break gold's open lines.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import Division, DivisionEligibilityLimit, DivisionLine, Season


@pytest.fixture
def session():
    with Session(engine) as s:
        yield s
        # These tests write real rows; leave the table as we found it so the
        # seed-importer tests in the next group start from a known state.
        s.execute(delete(DivisionEligibilityLimit))
        s.execute(delete(DivisionLine))
        s.execute(delete(Division))
        s.execute(delete(Season))
        s.commit()


@pytest.fixture
def division(session) -> Division:
    session.add(Season(year=1999, edition_name="测试赛季"))
    session.commit()
    d = Division(
        season_year=1999,
        code="gold",
        display_name="金组",
        scoring_mode="points",
        buffer_per_line=Decimal("0.30"),
        buffer_total=Decimal("0.30"),
        partner_gap_max=Decimal("3.50"),
    )
    session.add(d)
    session.commit()
    session.refresh(d)
    return d


def test_open_line_round_trips_as_none_not_zero(session, division):
    session.add(
        DivisionLine(
            division_id=division.id,
            code="D1",
            kind="mens_doubles",
            sort_order=1,
            cap=None,
            points=1,
        )
    )
    session.commit()
    session.expire_all()

    line = session.exec(select(DivisionLine).where(DivisionLine.code == "D1")).one()
    # The distinction that matters: no ceiling at all, versus a ceiling of 0.
    assert line.cap is None
    assert line.points == 1


def test_capped_line_keeps_two_decimal_places(session, division):
    # 10.25 is the 2026 silver mixed-doubles cap. A float column or a
    # too-narrow numeric would round this to 10.2 or 10.3 and quietly change
    # which lineups are legal.
    session.add(
        DivisionLine(
            division_id=division.id,
            code="MD",
            kind="mixed_doubles",
            sort_order=4,
            cap=Decimal("10.25"),
            points=1,
        )
    )
    session.commit()
    session.expire_all()

    line = session.exec(select(DivisionLine).where(DivisionLine.code == "MD")).one()
    assert line.cap == Decimal("10.25")


def test_division_keeps_both_buffer_allowances_distinct(session, division):
    session.expire_all()
    stored = session.get(Division, division.id)

    assert stored.buffer_per_line == Decimal("0.30")
    assert stored.buffer_total == Decimal("0.30")
    assert stored.scoring_mode == "points"
    assert stored.mens_doubles_must_be_ordered is True


def test_eligibility_limit_round_trips_a_line_whitelist(session, division):
    session.add(
        DivisionEligibilityLimit(
            division_id=division.id,
            gender="M",
            utr_above=Decimal("9.00"),
            max_players=1,
            restricted_to_lines=["D1", "MD"],
        )
    )
    session.commit()
    session.expire_all()

    limit = session.exec(select(DivisionEligibilityLimit)).one()
    assert limit.restricted_to_lines == ["D1", "MD"]
    assert limit.max_players == 1


def test_eligibility_limit_without_whitelist_round_trips_as_none(session, division):
    # Every silver limit is unrestricted. None must survive as None — an
    # empty list would read as "may play no line at all".
    session.add(
        DivisionEligibilityLimit(
            division_id=division.id,
            gender="F",
            utr_above=Decimal("5.50"),
            max_players=1,
            restricted_to_lines=None,
        )
    )
    session.commit()
    session.expire_all()

    limit = session.exec(select(DivisionEligibilityLimit)).one()
    assert limit.restricted_to_lines is None
