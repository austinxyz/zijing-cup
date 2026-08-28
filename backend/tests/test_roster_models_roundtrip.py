"""The ORM mappings must round-trip the roster states the schema allows, and
the constraints must actually fire.

Separate from test_roster_model.py, which inspects the schema. These go
through SQLModel because that is how the importer and the API touch the
tables — a mapping that coerced an unmarked borrowed-player flag to False
would pass every schema test and still hand downstream a false claim.

All names here are invented. Real rosters never enter the repository.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, delete, select

from app.db import engine
from app.models import Division, RosterEntry, Season, Team

TEST_YEAR = 1997  # no real season uses it; keeps this module's rows isolated


@pytest.fixture
def session():
    with Session(engine) as s:
        _cleanup(s)
        yield s
        _cleanup(s)


def _cleanup(s: Session) -> None:
    team_ids = [
        t.id for t in s.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    ]
    if team_ids:
        s.execute(delete(RosterEntry).where(RosterEntry.team_id.in_(team_ids)))
        s.execute(delete(Team).where(Team.id.in_(team_ids)))
    s.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    s.execute(delete(Season).where(Season.year == TEST_YEAR))
    s.commit()


@pytest.fixture
def teams(session) -> dict[str, Team]:
    """One season with both divisions, one team in each."""
    session.add(Season(year=TEST_YEAR, edition_name="测试赛季"))
    session.commit()
    made = {}
    for code, name in (("gold", "金组"), ("silver", "银组")):
        session.add(
            Division(
                season_year=TEST_YEAR,
                code=code,
                display_name=name,
                scoring_mode="match_count",
                partner_gap_max=Decimal("3.50"),
            )
        )
        session.commit()
        team = Team(season_year=TEST_YEAR, division_code=code, code=f"TEST-{code}")
        session.add(team)
        session.commit()
        session.refresh(team)
        made[code] = team
    return made


def _entry(team: Team, last: str, first: str, **kw) -> RosterEntry:
    defaults = dict(
        team_id=team.id,
        last_name=last,
        first_name=first,
        gender="M",
        match_utr=Decimal("6.50"),
        dutr_status="Rated",
    )
    defaults.update(kw)
    return RosterEntry(**defaults)


def test_roster_entry_round_trips_source_fields(session, teams):
    session.add(
        _entry(
            teams["silver"],
            "南",
            "望舒",
            source_note="Zijing Cup 2024 UTR",
            daily_utrs=[Decimal("6.48"), Decimal("6.51"), Decimal("6.50")],
        )
    )
    session.commit()
    session.expire_all()

    entry = session.exec(
        select(RosterEntry).where(RosterEntry.team_id == teams["silver"].id)
    ).one()
    assert entry.match_utr == Decimal("6.50")
    assert entry.source_note == "Zijing Cup 2024 UTR"
    assert entry.daily_utrs == [Decimal("6.48"), Decimal("6.51"), Decimal("6.50")]


def test_borrowed_player_flag_is_three_state(session, teams):
    session.add(_entry(teams["silver"], "未", "标注"))
    session.add(_entry(teams["silver"], "已", "标为外援", is_borrowed_player=True))
    session.add(_entry(teams["silver"], "已", "标为非外援", is_borrowed_player=False))
    session.commit()
    session.expire_all()

    by_name = {
        e.first_name: e
        for e in session.exec(
            select(RosterEntry).where(RosterEntry.team_id == teams["silver"].id)
        ).all()
    }
    # None is not False: "nobody has marked this" versus "confirmed not one".
    assert by_name["标注"].is_borrowed_player is None
    assert by_name["标为外援"].is_borrowed_player is True
    assert by_name["标为非外援"].is_borrowed_player is False


def test_rating_class_defaults_to_unset(session, teams):
    session.add(_entry(teams["silver"], "待", "判定", dutr_status="Unrated"))
    session.commit()
    session.expire_all()

    entry = session.exec(
        select(RosterEntry).where(RosterEntry.team_id == teams["silver"].id)
    ).one()
    assert entry.rating_class is None


def test_same_name_twice_on_one_team_is_rejected(session, teams):
    session.add(_entry(teams["silver"], "重", "名"))
    session.commit()
    session.add(_entry(teams["silver"], "重", "名"))

    # The snapshot key is (team, last, first). Allowing a duplicate would let
    # an import silently overwrite one of the two players.
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_profile_id_is_unique_within_a_team(session, teams):
    session.add(_entry(teams["silver"], "甲", "一", utr_profile_id="9001"))
    session.commit()
    session.add(_entry(teams["silver"], "乙", "二", utr_profile_id="9001"))

    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_same_profile_id_may_appear_in_both_divisions(session, teams):
    # The rules allow one person to enter both gold and silver in a season.
    session.add(_entry(teams["silver"], "两", "组", utr_profile_id="9002"))
    session.add(_entry(teams["gold"], "两", "组", utr_profile_id="9002"))
    session.commit()
    session.expire_all()

    found = session.exec(
        select(RosterEntry).where(RosterEntry.utr_profile_id == "9002")
    ).all()
    assert len(found) == 2


def test_many_entries_may_have_no_profile_id(session, teams):
    # The partial unique index must not treat NULLs as colliding — almost
    # every imported row will have none.
    for i in range(3):
        session.add(_entry(teams["silver"], "无", f"关联{i}"))
    session.commit()

    found = session.exec(
        select(RosterEntry).where(RosterEntry.team_id == teams["silver"].id)
    ).all()
    assert len(found) == 3
