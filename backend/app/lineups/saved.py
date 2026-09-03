"""Store, list, delete, and revalidate saved lineups.

The store functions own the database side; the route layer is thin. Writes are
reached only through routes the admin middleware guards by HTTP method. The
snapshot is stored as read-only history and never written back to any player's
participation UTR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlmodel import Session, select

from app.lineups.rules import Candidate, RuleSet, Violation, check_lineup
from app.models import SavedLineup

MAX_NAME_LENGTH = 60
MAX_SAVED_PER_TEAM = 50


@dataclass(frozen=True)
class SavedStatus:
    """A saved lineup re-judged against the current participation UTRs.

    status is one of:
      - "player_gone": a listed player is no longer on the roster (not judged).
      - "illegal":     legal at save, illegal now (violations say which rule).
      - "utr_moved":   still legal, but some player's UTR changed since save.
      - "valid":       still legal and no UTR moved.
    utr_diff lists only the players whose UTR changed, snapshot vs current.
    """
    status: str
    violations: list[Violation] = field(default_factory=list)
    #: key -> {"name": str, "snapshot": str, "current": str}
    utr_diff: dict[str, dict[str, str]] = field(default_factory=dict)
    missing: list[str] = field(default_factory=list)


def revalidate_saved(
    rules: RuleSet,
    roster: dict[str, Candidate],
    assignment: dict[str, Any],
    snapshot: dict[str, Any],
) -> SavedStatus:
    """Re-judge a saved lineup with the CURRENT participation UTRs.

    Legality is always the current values through the engine's own
    `check_lineup`; the snapshot is only used to report what moved. A lineup
    naming anyone off the current roster is never called legal.
    """
    keys = [key for pair in assignment.values() for key in pair]
    missing = [key for key in keys if key not in roster]
    if missing:
        return SavedStatus(status="player_gone", missing=missing)

    lineup = {
        line: (roster[pair[0]], roster[pair[1]])
        for line, pair in assignment.items()
    }
    report = check_lineup(rules, lineup)

    utr_diff: dict[str, dict[str, str]] = {}
    for key in keys:
        current = str(roster[key].match_utr)
        was = snapshot.get(key)
        if was is not None and was != current:
            utr_diff[key] = {
                "name": roster[key].name, "snapshot": was, "current": current,
            }

    if not report.is_legal:
        status = "illegal"
    elif utr_diff:
        status = "utr_moved"
    else:
        status = "valid"
    return SavedStatus(
        status=status, violations=list(report.violations), utr_diff=utr_diff,
    )


class InvalidSavedLineup(ValueError):
    """A save rejected before touching the row: empty/oversized name."""


class SavedLineupLimitExceeded(ValueError):
    """A save that would exceed the per-team count."""


def list_saved_lineups(session: Session, team_id: int) -> list[SavedLineup]:
    """Every saved lineup for a team, ordered by name so the list is stable."""
    return list(
        session.exec(
            select(SavedLineup)
            .where(SavedLineup.team_id == team_id)
            .order_by(SavedLineup.name)
        ).all()
    )


def save_lineup(
    session: Session,
    team_id: int,
    name: str,
    assignment: dict[str, Any],
    utr_snapshot: dict[str, Any],
) -> SavedLineup:
    """Store a lineup's name, line assignment, and UTR snapshot for a team.

    A name colliding with an existing saved lineup for this team overwrites it
    (the (team_id, name) pair is unique).
    """
    name = name.strip()
    if not name:
        raise InvalidSavedLineup("saved lineup name cannot be empty")
    if len(name) > MAX_NAME_LENGTH:
        raise InvalidSavedLineup(f"saved lineup name over {MAX_NAME_LENGTH} characters")

    existing = session.exec(
        select(SavedLineup).where(
            SavedLineup.team_id == team_id,
            SavedLineup.name == name,
        )
    ).one_or_none()

    if existing is not None:
        # An update, not a new row — never counts against the per-team cap.
        existing.assignment = assignment
        existing.utr_snapshot = utr_snapshot
        saved = existing
    else:
        if len(list_saved_lineups(session, team_id)) >= MAX_SAVED_PER_TEAM:
            raise SavedLineupLimitExceeded(
                f"a team may keep at most {MAX_SAVED_PER_TEAM} saved lineups"
            )
        saved = SavedLineup(
            team_id=team_id, name=name,
            assignment=assignment, utr_snapshot=utr_snapshot,
        )
        session.add(saved)

    session.commit()
    session.refresh(saved)
    return saved


def delete_saved_lineup(session: Session, team_id: int, saved_id: int) -> None:
    """Remove one saved lineup. Scoped by team_id so an id cannot reach another
    team's lineup; a missing id is a no-op, not an error."""
    saved = session.exec(
        select(SavedLineup).where(
            SavedLineup.id == saved_id,
            SavedLineup.team_id == team_id,
        )
    ).one_or_none()
    if saved is None:
        return
    session.delete(saved)
    session.commit()
