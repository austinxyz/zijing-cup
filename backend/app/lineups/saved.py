"""Store, list, delete, and revalidate saved lineups.

The store functions own the database side; the route layer is thin. Writes are
reached only through routes the admin middleware guards by HTTP method. The
snapshot is stored as read-only history and never written back to any player's
participation UTR.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.lineups.rules import (
    Candidate,
    RuleSet,
    Violation,
    check_lineup,
    pair_total,
)
from app.models import SavedLineup

MAX_NAME_LENGTH = 60
MAX_SAVED_PER_TEAM = 50


@dataclass(frozen=True)
class LineTotal:
    """A saved line's participation-UTR sum against its cap, for display. `over`
    is 0 on an open line or one within cap; the cap judgement itself is the
    engine's, this only reports the arithmetic behind it."""
    total: Decimal
    cap: Optional[Decimal]
    over: Decimal


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
    #: line code -> its current sum, cap, overage. Empty when a player is gone
    #: (the lineup cannot be totalled), computed from current UTRs otherwise.
    line_totals: dict[str, LineTotal] = field(default_factory=dict)
    #: How much of the team buffer the current overages spend, for display next
    #: to the whole-team allowance.
    buffer_spent: Decimal = Decimal(0)


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

    # Per-line sums against caps, and the buffer they spend — the same
    # arithmetic the engine uses (pair_total + cap), surfaced for display so
    # the card can show each line's total and the team's buffer use.
    line_totals: dict[str, LineTotal] = {}
    buffer_spent = Decimal(0)
    for rule in rules.lines:
        pair = lineup.get(rule.code)
        if pair is None:
            continue
        total = pair_total(pair)
        over = total - rule.cap if rule.cap is not None else Decimal(0)
        if over < 0:
            over = Decimal(0)
        line_totals[rule.code] = LineTotal(total=total, cap=rule.cap, over=over)
        buffer_spent += over

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
        line_totals=line_totals, buffer_spent=buffer_spent,
    )


class InvalidSavedLineup(ValueError):
    """A save rejected before touching the row: empty/oversized name."""


class SavedLineupLimitExceeded(ValueError):
    """A save that would exceed the per-team count."""


def list_saved_lineups(session: Session, team_id: int) -> list[SavedLineup]:
    """Every saved lineup for a team, in display order.

    Ordered by `(sort_order, id)`: the editable order the captain set, with id
    as a stable tiebreak (default-0 rows before a backfill, or a race on two
    fresh inserts, must not reorder run to run)."""
    return list(
        session.exec(
            select(SavedLineup)
            .where(SavedLineup.team_id == team_id)
            .order_by(SavedLineup.sort_order, SavedLineup.id)
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
            sort_order=_next_sort_order(session, team_id),
        )
        session.add(saved)

    session.commit()
    session.refresh(saved)
    return saved


def _next_sort_order(session: Session, team_id: int) -> int:
    """One past the team's current maximum, so a new lineup lands at the end.
    Empty team → 0."""
    rows = session.exec(
        select(SavedLineup.sort_order).where(SavedLineup.team_id == team_id)
    ).all()
    return (max(rows) + 1) if rows else 0


class BadReorder(ValueError):
    """The reorder id list is not exactly this team's current set of ids."""


def reorder_saved_lineups(
    session: Session, team_id: int, ordered_ids: list[int]
) -> None:
    """Write `sort_order` by list position for a team's saved lineups.

    Takes the WHOLE ordered id list, not a single move: it is idempotent (send
    the same list twice → no change) and race-safe (two tabs cannot splice a
    half-order). The list must be exactly this team's current id set — same
    members, no duplicates, no strangers, nothing missing — or the whole call
    is rejected and nothing is written. A partial write would leave the order
    half-old with nothing on screen saying which half.
    """
    current = {
        s.id
        for s in session.exec(
            select(SavedLineup).where(SavedLineup.team_id == team_id)
        ).all()
    }
    if len(ordered_ids) != len(set(ordered_ids)) or set(ordered_ids) != current:
        raise BadReorder(
            "order must list exactly this team's saved-lineup ids, once each"
        )

    for position, saved_id in enumerate(ordered_ids):
        row = session.get(SavedLineup, saved_id)
        row.sort_order = position
        session.add(row)
    session.commit()


class SavedLineupNotFound(ValueError):
    """A clone/lookup for an id not on this team."""


def clone_saved_lineup(
    session: Session, team_id: int, saved_id: int
) -> SavedLineup:
    """Copy a saved lineup into a new row for the same team.

    A true copy: `assignment` and `utr_snapshot` are taken verbatim from the
    source, NOT re-snapshotted against current UTRs — the clone is "another
    copy of that lineup as it was", so it revalidates to the same status as its
    source at clone time. Named `<name> 副本`, deduped to `副本2`/`副本3`… since
    `(team_id, name)` is unique. Appended (sort_order max+1). Counts against the
    per-team cap like any new row.
    """
    source = session.exec(
        select(SavedLineup).where(
            SavedLineup.id == saved_id,
            SavedLineup.team_id == team_id,
        )
    ).one_or_none()
    if source is None:
        raise SavedLineupNotFound(f"no saved lineup {saved_id} on this team")

    if len(list_saved_lineups(session, team_id)) >= MAX_SAVED_PER_TEAM:
        raise SavedLineupLimitExceeded(
            f"a team may keep at most {MAX_SAVED_PER_TEAM} saved lineups"
        )

    name = _unique_clone_name(session, team_id, source.name)
    clone = SavedLineup(
        team_id=team_id,
        name=name,
        # dict(...) so the clone owns its own JSON, not a shared reference.
        assignment=dict(source.assignment),
        utr_snapshot=dict(source.utr_snapshot),
        sort_order=_next_sort_order(session, team_id),
    )
    session.add(clone)
    session.commit()
    session.refresh(clone)
    return clone


def _unique_clone_name(session: Session, team_id: int, base: str) -> str:
    """`<base> 副本`, then `副本2`, `副本3`… — the first not already taken on
    this team. Bounded by the per-team cap, so the probe terminates.

    The result is clamped to `MAX_NAME_LENGTH`: the DB enforces a 1-60 char
    check, and a near-max source name plus the suffix would otherwise overflow
    and surface as a raw 500. The base is trimmed to leave room for the suffix
    (the suffix always wins — it is what makes the name a distinct copy)."""
    def taken(candidate: str) -> bool:
        return session.exec(
            select(SavedLineup).where(
                SavedLineup.team_id == team_id,
                SavedLineup.name == candidate,
            )
        ).one_or_none() is not None

    def fit(suffix: str) -> str:
        room = MAX_NAME_LENGTH - len(suffix)
        return f"{base[:room]}{suffix}"

    first = fit(" 副本")
    if not taken(first):
        return first
    n = 2
    while taken(fit(f" 副本{n}")):
        n += 1
    return fit(f" 副本{n}")


class UnknownAssignmentKey(ValueError):
    """An assignment names a player key the current roster does not have."""


def assignment_violations(
    rules: RuleSet,
    roster: dict[str, Candidate],
    assignment: dict[str, Any],
) -> list[Violation]:
    """Legality of a 5-line assignment under the CURRENT participation UTRs.

    Reuses the engine's own `check_lineup` — no second copy of the rules.
    Conflicts (a player placed twice, over cap, over gap, ...) are reported by
    check_lineup, never pre-blocked here. A key the roster does not resolve is
    the caller's to translate into a 4xx.
    """
    lineup = {}
    for line, pair in assignment.items():
        resolved = []
        for key in pair:
            if key not in roster:
                raise UnknownAssignmentKey(key)
            resolved.append(roster[key])
        lineup[line] = (resolved[0], resolved[1])
    return list(check_lineup(rules, lineup).violations)


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
