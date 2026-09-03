"""Saved lineups: store a chosen 10-player lineup + a participation-UTR
snapshot, revalidate it against current UTRs, and validate an assignment.

The store tests hit the local Postgres via `engine`; the revalidation tests
are pure (hand-built RuleSet + Candidates), no database.
"""

import os
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

import pytest
from sqlmodel import Session, select

from app.db import engine
from app.models import Division, Player, PlayerSeasonUtr, Season, Team
from app.lineups.saved import (
    InvalidSavedLineup,
    MAX_SAVED_PER_TEAM,
    SavedLineupLimitExceeded,
    delete_saved_lineup,
    list_saved_lineups,
    save_lineup,
)

D = Decimal
TEST_YEAR = 2091


def _cleanup(session: Session) -> None:
    for team in session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all():
        session.delete(team)
    for division in session.exec(
        select(Division).where(Division.season_year == TEST_YEAR)
    ).all():
        session.delete(division)
    season = session.get(Season, TEST_YEAR)
    if season is not None:
        session.delete(season)
    session.commit()


@pytest.fixture()
def team_id():
    with Session(engine) as session:
        _cleanup(session)
        session.add(Season(year=TEST_YEAR, edition_name="已存阵容测试赛季"))
        session.commit()
        session.add(Division(
            season_year=TEST_YEAR, code="silver", display_name="银组",
            scoring_mode="match_count", buffer_per_line=D("0.5"),
            buffer_total=D("0.5"), partner_gap_max=D("3.50"),
        ))
        session.commit()
        team = Team(season_year=TEST_YEAR, division_code="silver", code="SL-A")
        session.add(team)
        session.commit()
        session.refresh(team)
        tid = team.id
    yield tid
    with Session(engine) as session:
        _cleanup(session)


ASSIGN = {
    "D1": ["p1", "p2"], "D2": ["p3", "p4"], "D3": ["p5", "p6"],
    "MD": ["p7", "p8"], "WD": ["p9", "p10"],
}
SNAP = {f"p{i}": f"{6.0 - i * 0.1:.2f}" for i in range(1, 11)}


class TestStoreAndList:
    def test_save_then_list_returns_it(self, team_id):
        with Session(engine) as session:
            save_lineup(session, team_id, "主力最强", ASSIGN, SNAP)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].name == "主力最强"
        assert got[0].assignment["D1"] == ["p1", "p2"]
        assert got[0].utr_snapshot["p1"] == "5.90"


class TestOverwriteAndLimits:
    def test_same_name_overwrites(self, team_id):
        alt = {**ASSIGN, "D1": ["p2", "p1"]}
        with Session(engine) as session:
            save_lineup(session, team_id, "主力", ASSIGN, SNAP)
            save_lineup(session, team_id, "主力", alt, SNAP)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].assignment["D1"] == ["p2", "p1"]

    def test_empty_and_long_name_rejected(self, team_id):
        with Session(engine) as session:
            with pytest.raises(InvalidSavedLineup):
                save_lineup(session, team_id, "  ", ASSIGN, SNAP)
            with pytest.raises(InvalidSavedLineup):
                save_lineup(session, team_id, "x" * 61, ASSIGN, SNAP)
            assert list_saved_lineups(session, team_id) == []

    def test_per_team_cap(self, team_id):
        with Session(engine) as session:
            for i in range(MAX_SAVED_PER_TEAM):
                save_lineup(session, team_id, f"L{i}", ASSIGN, SNAP)
            with pytest.raises(SavedLineupLimitExceeded):
                save_lineup(session, team_id, "one-too-many", ASSIGN, SNAP)
            assert len(list_saved_lineups(session, team_id)) == MAX_SAVED_PER_TEAM


class TestDeleteAndSaveBack:
    def test_delete_removes_it(self, team_id):
        with Session(engine) as session:
            a = save_lineup(session, team_id, "甲", ASSIGN, SNAP)
            save_lineup(session, team_id, "乙", ASSIGN, SNAP)
            delete_saved_lineup(session, team_id, a.id)
            names = [s.name for s in list_saved_lineups(session, team_id)]
        assert names == ["乙"]

    def test_delete_missing_is_quiet(self, team_id):
        with Session(engine) as session:
            delete_saved_lineup(session, team_id, 99999999)
            assert list_saved_lineups(session, team_id) == []

    def test_save_back_overwrites_assignment_and_snapshot(self, team_id):
        edited = {**ASSIGN, "D2": ["p4", "p3"]}
        new_snap = {**SNAP, "p3": "7.00"}
        with Session(engine) as session:
            save_lineup(session, team_id, "主力", ASSIGN, SNAP)
            save_lineup(session, team_id, "主力", edited, new_snap)
            got = list_saved_lineups(session, team_id)
        assert len(got) == 1
        assert got[0].assignment["D2"] == ["p4", "p3"]
        assert got[0].utr_snapshot["p3"] == "7.00"


# --- Revalidation: pure, hand-built rules + roster (no database) --------------

from app.lineups.rules import Candidate, EligibilityLimit, LineRule, RuleSet
from app.lineups.saved import revalidate_saved

SILVER = RuleSet(
    lines=[
        LineRule("D1", "mens_doubles", D("13.00")),
        LineRule("D2", "mens_doubles", D("12.00")),
        LineRule("D3", "mens_doubles", D("11.00")),
        LineRule("MD", "mixed_doubles", D("10.25")),
        LineRule("WD", "womens_doubles", D("9.25")),
    ],
    buffer_per_line=D("0.5"), buffer_total=D("0.5"), partner_gap_max=D("3.50"),
    limits=[EligibilityLimit("M", D("7.0"), 1, None)],
)

# A legal SILVER lineup: 7 men + 3 women.
_MEN = {"m1": "6.80", "m2": "6.00", "m3": "5.80", "m4": "5.60",
        "m5": "5.40", "m6": "5.20", "m7": "5.00"}
_WOMEN = {"w1": "4.60", "w2": "4.40", "w3": "4.20"}
LEGAL_ASSIGN = {
    "D1": ["m1", "m2"], "D2": ["m3", "m4"], "D3": ["m5", "m6"],
    "MD": ["m7", "w1"], "WD": ["w2", "w3"],
}


def _roster(overrides=None):
    vals = {**_MEN, **_WOMEN}
    if overrides:
        vals.update(overrides)
    out = {}
    for k, v in vals.items():
        gender = "M" if k.startswith("m") else "F"
        out[k] = Candidate(k, k, gender, D(v))
    return out


def _snap(overrides=None):
    vals = {**_MEN, **_WOMEN}
    if overrides:
        vals.update(overrides)
    return dict(vals)


class TestRevalidate:
    def test_unchanged_and_legal_is_valid(self):
        r = revalidate_saved(SILVER, _roster(), LEGAL_ASSIGN, _snap())
        assert r.status == "valid"
        assert r.violations == []
        assert r.utr_diff == {}

    def test_utr_moved_still_legal(self):
        # m2 6.00 -> 6.10: D1 = 12.90, still under cap 13.00.
        r = revalidate_saved(SILVER, _roster({"m2": "6.10"}), LEGAL_ASSIGN, _snap())
        assert r.status == "utr_moved"
        assert not r.violations
        assert "m2" in r.utr_diff
        assert r.utr_diff["m2"]["snapshot"] == "6.00"
        assert r.utr_diff["m2"]["current"] == "6.10"

    def test_utr_moved_now_illegal(self):
        # m1 6.80 -> 7.60: D1 = 13.60 > cap 13.00 + buffer 0.50.
        r = revalidate_saved(SILVER, _roster({"m1": "7.60"}), LEGAL_ASSIGN, _snap())
        assert r.status == "illegal"
        assert any(v.line == "D1" for v in r.violations)
        assert "m1" in r.utr_diff

    def test_player_gone(self):
        roster = _roster()
        del roster["w3"]  # w3 left the roster
        r = revalidate_saved(SILVER, roster, LEGAL_ASSIGN, _snap())
        assert r.status == "player_gone"
        assert "w3" in r.missing


class TestSnapshotDoesNotWriteBack:
    def test_saving_a_lineup_leaves_participation_utr_untouched(self, team_id):
        with Session(engine) as session:
            player = Player(last_name="南", first_name="望舒", gender="M")
            session.add(player)
            session.commit()
            session.refresh(player)
            session.add(PlayerSeasonUtr(
                player_id=player.id, season_year=TEST_YEAR, value=D("6.00"),
                source="committee_sheet",
            ))
            session.commit()
            pid = player.id

            # A save carries its own snapshot; it must never touch the source.
            save_lineup(
                session, team_id, "主力",
                {"D1": [f"p{pid}", "p2"]}, {f"p{pid}": "9.99"},
            )

            utr = session.exec(
                select(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id == pid,
                    PlayerSeasonUtr.season_year == TEST_YEAR,
                )
            ).one()
            assert utr.value == D("6.00")
            session.delete(session.get(Player, pid))
            session.commit()
