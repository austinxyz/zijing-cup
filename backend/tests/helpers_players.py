"""A throwaway roster snapshot for the migration tests.

Builds a reserved season with both divisions, a few teams and a handful of
`roster_entries` — including the shape that matters: one person on a gold team
and a silver team with two slightly different participation UTRs, which is
what 17 real people looked like in 2025.

All names are invented.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from sqlmodel import Session, delete, func, select

from app.db import engine
from app.models import (
    Division,
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    RosterEntry,
    Season,
    SeasonLock,
    Team,
)

TEST_YEAR = 1992  # reserved for the migration tests

#: (team code, division, last, first, gender, utr, sheet status)
ROWS = [
    ("MIG-GOLD", "gold", "Zong", "Qingqing", "F", "6.25", "Rated"),
    ("MIG-SILVER", "silver", "Zong", "Qingqing", "F", "6.38", "Rated"),
    ("MIG-GOLD", "gold", "Cai", "Ying", "M", "7.24", "Rated"),
    ("MIG-SILVER", "silver", "Cai", "Ying", "M", "7.24", "Rated"),
    ("MIG-SILVER", "silver", "Ye", "Ming", "M", "6.72", "Projected"),
    ("MIG-SILVER", "silver", "Wang", "Tom", None, "5.00", "Unrated"),
]


@dataclass
class Snapshot:
    session: Session
    year: int
    row_count: int
    expected_players: int

    def count_players(self) -> int:
        """Only the people this snapshot is about.

        A global count would also see whatever a real migration left in the
        local database, and this test would then fail for reasons that have
        nothing to do with the code under test.
        """
        names = {(last, first) for _, _, last, first, *_ in ROWS}
        rows = self.session.exec(
            select(Player).where(
                Player.last_name.in_({last for last, _ in names})
            )
        ).all()
        return len([p for p in rows if (p.last_name, p.first_name) in names])


def _purge(session: Session) -> None:
    teams = session.exec(select(Team).where(Team.season_year == TEST_YEAR)).all()
    for team in teams:
        session.execute(
            delete(PlayerTeamMembership).where(
                PlayerTeamMembership.team_id == team.id
            )
        )
        session.execute(delete(RosterEntry).where(RosterEntry.team_id == team.id))
    session.execute(
        delete(PlayerSeasonUtr).where(PlayerSeasonUtr.season_year == TEST_YEAR)
    )
    session.commit()
    for team in teams:
        session.delete(team)
    session.commit()
    session.execute(delete(SeasonLock).where(SeasonLock.season_year == TEST_YEAR))
    session.execute(delete(Division).where(Division.season_year == TEST_YEAR))
    session.execute(delete(Season).where(Season.year == TEST_YEAR))
    session.commit()
    # Players are global, not season-scoped: clear the ones this snapshot's
    # migration would have created, identified by the names above.
    for last, first in {(r[2], r[3]) for r in ROWS}:
        for player in session.exec(
            select(Player).where(
                Player.last_name == last, Player.first_name == first
            )
        ).all():
            session.execute(
                delete(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
            )
            session.execute(
                delete(PlayerTeamMembership).where(
                    PlayerTeamMembership.player_id == player.id
                )
            )
            session.delete(player)
    session.commit()


@contextmanager
def build_snapshot():
    with Session(engine) as session:
        _purge(session)

        session.add(Season(year=TEST_YEAR, edition_name="迁移测试赛季"))
        session.commit()
        for code, name in [("gold", "金组"), ("silver", "银组")]:
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

        teams: dict[str, Team] = {}
        for code, division, *_ in ROWS:
            if code in teams:
                continue
            team = Team(season_year=TEST_YEAR, division_code=division, code=code)
            session.add(team)
            session.commit()
            session.refresh(team)
            teams[code] = team

        for code, _division, last, first, gender, utr, status in ROWS:
            session.add(
                RosterEntry(
                    team_id=teams[code].id,
                    last_name=last,
                    first_name=first,
                    gender=gender,
                    match_utr=Decimal(utr),
                    dutr_status=status,
                )
            )
        session.commit()

        yield Snapshot(
            session=session,
            year=TEST_YEAR,
            row_count=len(ROWS),
            expected_players=len({(r[2], r[3]) for r in ROWS}),
        )

        _purge(session)
