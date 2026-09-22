"""Participation UTR sampling: snapshot each season player's current doubles UTR
daily, monitor the 5-day window, and set the rated-day average as the frozen
participation UTR.

The participation UTR is the mean of 9/21-9/25 doubles UTR. This records each
day's current doubles value into player_daily_utr (one row per season/player/
date), computes the rated-day average, flags projected/unrated players for the
committee, and lets the committee "set" the average into PlayerSeasonUtr (reusing
the existing set_season_utr command, which refuses on a locked season).

All names/ids invented.
"""

import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")
os.environ.setdefault("ADMIN_SECRET", "admin-secret")

from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.db import engine
from app.main import app
from app.models import (
    Division,
    Player,
    PlayerDailyUtr,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    Season,
    SeasonLock,
    Team,
)

TEST_YEAR = 2999
READ = {"X-Backend-Secret": "test-secret"}
WRITE = {"X-Backend-Secret": "test-secret", "X-Admin-Secret": "admin-secret"}


def _purge(session: Session) -> None:
    for model in (
        PlayerDailyUtr,
        PlayerSeasonUtr,
        PlayerTeamMembership,
        SeasonLock,
        Team,
        Player,
        Division,
        Season,
    ):
        session.exec(delete(model))
    session.commit()


def _mk_player(session, last, first, doubles_utr, doubles_status, team_id):
    p = Player(
        last_name=last, first_name=first, gender="M",
        doubles_utr=Decimal(doubles_utr) if doubles_utr is not None else None,
        doubles_status=doubles_status,
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    session.add(PlayerTeamMembership(player_id=p.id, team_id=team_id))
    session.commit()
    return p.id


@pytest.fixture()
def client():
    with Session(engine) as session:
        _purge(session)
        session.add(Season(year=TEST_YEAR, edition_name="采样测试赛季"))
        session.commit()
        for code, name in (("gold", "金组"), ("silver", "银组")):
            session.add(Division(
                season_year=TEST_YEAR, code=code, display_name=name,
                scoring_mode="match_count", partner_gap_max=Decimal("3.50"),
            ))
        session.commit()
        gold = Team(season_year=TEST_YEAR, division_code="gold", code="GA")
        silver = Team(season_year=TEST_YEAR, division_code="silver", code="SA")
        session.add(gold); session.add(silver); session.commit()
        session.refresh(gold); session.refresh(silver)
        ids = {
            "g_rated": _mk_player(session, "金", "甲", "6.70", "rated", gold.id),
            "s_rated": _mk_player(session, "银", "乙", "5.60", "rated", silver.id),
        }
    yield TestClient(app), ids
    with Session(engine) as session:
        _purge(session)


def _snap(client):
    return client.post(
        f"/api/seasons/{TEST_YEAR}/participation-utr/snapshot", headers=WRITE
    )


class TestSnapshot:
    def test_snapshot_writes_todays_current_doubles_for_all_season_players(self, client):
        c, ids = client
        resp = _snap(c)
        assert resp.status_code in (200, 201), resp.text

        with Session(engine) as s:
            rows = s.exec(
                select(PlayerDailyUtr).where(PlayerDailyUtr.season_year == TEST_YEAR)
            ).all()
        # Both divisions' players covered.
        assert {r.player_id for r in rows} == set(ids.values())
        today = date.today()
        assert all(r.sample_date == today for r in rows)
        by_id = {r.player_id: r for r in rows}
        assert by_id[ids["g_rated"]].doubles_utr == Decimal("6.70")
        assert by_id[ids["g_rated"]].doubles_status == "rated"

    def test_same_day_snapshot_upserts_not_duplicates(self, client):
        c, ids = client
        _snap(c)
        # Change the current value, snapshot again same day → overwrite, not add.
        with Session(engine) as s:
            p = s.get(Player, ids["g_rated"])
            p.doubles_utr = Decimal("6.99")
            s.add(p); s.commit()
        _snap(c)
        with Session(engine) as s:
            rows = s.exec(
                select(PlayerDailyUtr).where(
                    PlayerDailyUtr.season_year == TEST_YEAR,
                    PlayerDailyUtr.player_id == ids["g_rated"],
                )
            ).all()
        assert len(rows) == 1
        assert rows[0].doubles_utr == Decimal("6.99")


def _add_sample(session, year, player_id, d, utr, status):
    session.add(PlayerDailyUtr(
        season_year=year, player_id=player_id, sample_date=d,
        doubles_utr=Decimal(utr) if utr is not None else None, doubles_status=status,
    ))
    session.commit()


class TestReadAndAverage:
    def test_batch_read_groups_by_player_with_rated_avg_and_flag(self, client):
        c, ids = client
        pid = ids["g_rated"]
        with Session(engine) as s:
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 21), "6.70", "rated")
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 22), "6.74", "rated")  # avg 6.72
            # the silver player: one projected day → flagged, excluded from avg
            sp = ids["s_rated"]
            _add_sample(s, TEST_YEAR, sp, date(2026, 9, 21), "5.60", "rated")
            _add_sample(s, TEST_YEAR, sp, date(2026, 9, 22), "5.90", "projected")

        resp = c.get(f"/api/seasons/{TEST_YEAR}/participation-utr", headers=READ)
        assert resp.status_code == 200, resp.text
        body = {row["player_id"]: row for row in resp.json()}

        g = body[pid]
        assert g["rated_avg"] == "6.72"        # (6.70+6.74)/2, 2dp
        assert g["flag"] == "ok"
        assert g["can_set"] is True
        # samples carried per-date for the monitor columns
        dates = {sm["sample_date"]: sm for sm in g["samples"]}
        assert dates["2026-09-21"]["doubles_utr"] == "6.70"

        sflag = body[ids["s_rated"]]
        assert sflag["rated_avg"] == "5.60"     # only the rated day
        assert sflag["flag"] == "needs_review"  # has a projected day
        assert sflag["can_set"] is False

    def test_no_rated_days_gives_no_average(self, client):
        c, ids = client
        pid = ids["g_rated"]
        with Session(engine) as s:
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 21), None, "unrated")
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 22), "6.80", "projected")
        resp = c.get(f"/api/seasons/{TEST_YEAR}/participation-utr", headers=READ)
        g = {row["player_id"]: row for row in resp.json()}[pid]
        assert g["rated_avg"] is None
        assert g["flag"] == "needs_review"
        assert g["can_set"] is False


class TestSetAndAuth:
    def _seed_rated_two_days(self, ids):
        pid = ids["g_rated"]
        with Session(engine) as s:
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 21), "6.70", "rated")
            _add_sample(s, TEST_YEAR, pid, date(2026, 9, 22), "6.74", "rated")
        return pid

    def test_set_writes_rated_avg_into_participation_utr(self, client):
        c, ids = client
        pid = self._seed_rated_two_days(ids)
        resp = c.post(
            f"/api/seasons/{TEST_YEAR}/participation-utr/{pid}/set", headers=WRITE
        )
        assert resp.status_code in (200, 201), resp.text
        with Session(engine) as s:
            row = s.exec(
                select(PlayerSeasonUtr).where(
                    PlayerSeasonUtr.player_id == pid,
                    PlayerSeasonUtr.season_year == TEST_YEAR,
                )
            ).one()
        assert row.value == Decimal("6.72")

    def test_set_on_a_locked_season_is_409(self, client):
        c, ids = client
        pid = self._seed_rated_two_days(ids)
        with Session(engine) as s:
            s.add(SeasonLock(season_year=TEST_YEAR))
            s.commit()
        resp = c.post(
            f"/api/seasons/{TEST_YEAR}/participation-utr/{pid}/set", headers=WRITE
        )
        assert resp.status_code == 409, resp.text

    def test_read_without_backend_secret_is_401(self, client):
        c, _ = client
        assert c.get(f"/api/seasons/{TEST_YEAR}/participation-utr").status_code == 401

    def test_snapshot_without_admin_is_403(self, client):
        c, _ = client
        assert c.post(
            f"/api/seasons/{TEST_YEAR}/participation-utr/snapshot", headers=READ
        ).status_code == 403

    def test_set_without_admin_is_403(self, client):
        c, ids = client
        assert c.post(
            f"/api/seasons/{TEST_YEAR}/participation-utr/{ids['g_rated']}/set",
            headers=READ,
        ).status_code == 403
