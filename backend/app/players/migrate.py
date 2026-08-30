"""Read the roster snapshot into the player registry.

Shape mirrors `load_rules` / `load_rosters`: read the source, read what is
already there, compare, write only the differences — with `--check` stopping
after the comparison and turning it into an exit code. `--check` and the real
run share ONE comparison, because a check computing it separately could report
clean while the run would still write.

Deliberately a command rather than DML inside a migration file. The remote
database is updated by pasting migration SQL into the Supabase dashboard (the
project is shared, so the CLI's push is off-limits); a few hundred rows of DML
executed there is neither observable nor retryable. A command can be run with
`--check` first, read, and then run for real.

`roster_entries` is only ever READ here. Nothing writes back to it, which is
what keeps the rollback simple: drop the three new tables and the system is
where it started.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from typing import Optional, Sequence

from sqlmodel import Session, select

from app.db import engine
from app.models import (
    Player,
    PlayerSeasonUtr,
    PlayerTeamMembership,
    RosterEntry,
    Team,
)
from app.players.merge_rules import PlayerPlan, SourceRow, group_rows, identity_key


@dataclass
class MigrationReport:
    """What the run did, or what a `--check` run would have done."""

    players_created: int = 0
    memberships_created: int = 0
    season_utrs_created: int = 0
    unresolved: int = 0
    #: Names that already existed as players, so this run adopted them rather
    #: than creating a second record for the same person.
    players_matched: int = 0
    seasons: list[int] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return not (
            self.players_created
            or self.memberships_created
            or self.season_utrs_created
        )


def read_source_rows(
    session: Session, seasons: Optional[Sequence[int]] = None
) -> list[SourceRow]:
    """Every roster row in the given seasons, as the pure rules want them."""
    statement = select(RosterEntry, Team).join(Team, Team.id == RosterEntry.team_id)
    if seasons is not None:
        statement = statement.where(Team.season_year.in_(list(seasons)))

    return [
        SourceRow(
            last_name=entry.last_name,
            first_name=entry.first_name,
            season_year=team.season_year,
            division_code=team.division_code,
            team_code=team.code,
            match_utr=entry.match_utr,
            gender=entry.gender,
            dutr_status=entry.dutr_status,
            rating_class=entry.rating_class,
            utr_profile_id=entry.utr_profile_id,
        )
        for entry, team in session.exec(statement).all()
    ]


def _existing_players(session: Session) -> dict[str, Player]:
    return {
        identity_key(p.last_name, p.first_name): p
        for p in session.exec(select(Player)).all()
    }


def _team_ids(session: Session, seasons: Sequence[int]) -> dict[tuple, int]:
    rows = session.exec(
        select(Team).where(Team.season_year.in_(list(seasons)))
    ).all()
    return {(t.season_year, t.division_code, t.code): t.id for t in rows}


def migrate_rosters(
    session: Session,
    seasons: Optional[Sequence[int]] = None,
    check_only: bool = False,
) -> MigrationReport:
    """Fold the roster snapshot into players, season UTRs and memberships.

    Idempotent: a player who already exists is adopted rather than duplicated,
    and rows already present are left alone. Running it twice is a no-op, which
    is what makes it safe to run `--check`, read the numbers, and then run it
    for real.
    """
    rows = read_source_rows(session, seasons)
    involved = sorted({row.season_year for row in rows})
    plans = group_rows(rows)

    report = MigrationReport(seasons=involved)
    existing = _existing_players(session)
    team_ids = _team_ids(session, involved) if involved else {}

    for plan in plans:
        player = existing.get(plan.identity)
        if player is None:
            report.players_created += 1
            if check_only:
                # Nothing to hang the child rows off, but they would all be
                # new, so count them and move on.
                report.season_utrs_created += len(plan.season_utrs)
                report.memberships_created += len(plan.memberships)
                report.unresolved += sum(
                    1 for u in plan.season_utrs if u.is_unresolved
                )
                continue
            player = _create_player(session, plan)
            existing[plan.identity] = player
        else:
            report.players_matched += 1

        _apply_season_utrs(session, player, plan, report, check_only)
        _apply_memberships(session, player, plan, team_ids, report, check_only)

    if not check_only:
        session.commit()
    else:
        session.rollback()

    return report


def _create_player(session: Session, plan: PlayerPlan) -> Player:
    player = Player(
        last_name=plan.last_name,
        first_name=plan.first_name,
        gender=plan.gender,
        utr_profile_id=plan.utr_profile_id,
    )
    session.add(player)
    session.flush()  # need the id for the child rows
    return player


def _apply_season_utrs(
    session: Session,
    player: Player,
    plan: PlayerPlan,
    report: MigrationReport,
    check_only: bool,
) -> None:
    have = {
        row.season_year
        for row in session.exec(
            select(PlayerSeasonUtr).where(PlayerSeasonUtr.player_id == player.id)
        ).all()
    }
    for utr in plan.season_utrs:
        if utr.season_year in have:
            # Already migrated. Deliberately not overwritten: by the time this
            # runs again an admin may have ruled on the conflict, and a re-run
            # must not undo that ruling.
            continue
        report.season_utrs_created += 1
        if utr.is_unresolved:
            report.unresolved += 1
        if check_only:
            continue
        session.add(
            PlayerSeasonUtr(
                player_id=player.id,
                season_year=utr.season_year,
                value=utr.value,
                alt_value=utr.alt_value,
                is_unresolved=utr.is_unresolved,
                status=utr.status,
                under_appeal=utr.under_appeal,
                source=utr.source,
                value_division=utr.value_division,
                alt_value_division=utr.alt_value_division,
            )
        )


def _apply_memberships(
    session: Session,
    player: Player,
    plan: PlayerPlan,
    team_ids: dict[tuple, int],
    report: MigrationReport,
    check_only: bool,
) -> None:
    have = {
        row.team_id
        for row in session.exec(
            select(PlayerTeamMembership).where(
                PlayerTeamMembership.player_id == player.id
            )
        ).all()
    }
    for membership in plan.memberships:
        team_id = team_ids.get(
            (membership.season_year, membership.division_code, membership.team_code)
        )
        if team_id is None or team_id in have:
            continue
        report.memberships_created += 1
        have.add(team_id)
        if check_only:
            continue
        session.add(
            PlayerTeamMembership(player_id=player.id, team_id=team_id)
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--season",
        type=int,
        action="append",
        dest="seasons",
        help="Season year to migrate; repeatable. Omit for every season.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Report what would be written without writing anything.",
    )
    args = parser.parse_args()

    with Session(engine) as session:
        report = migrate_rosters(
            session, seasons=args.seasons, check_only=args.check
        )

    verb = "would create" if args.check else "created"
    print(f"seasons: {', '.join(str(y) for y in report.seasons) or 'none'}")
    print(f"{verb}: {report.players_created} players, "
          f"{report.memberships_created} memberships, "
          f"{report.season_utrs_created} season UTRs")
    print(f"matched existing players: {report.players_matched}")
    print(f"unresolved season UTRs: {report.unresolved}")

    # A check run exits non-zero when there is work to do, so it can gate a
    # deploy step the same way `load_rules --check` does.
    return 1 if (args.check and not report.is_clean) else 0


if __name__ == "__main__":
    raise SystemExit(main())
