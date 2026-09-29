"""Store, list, annotate, and delete saved opponent comparisons.

A comparison is a named (team_a+lineup_a vs team_b+lineup_b) reference per
(season, division), plus a per-line notes map. These functions own the database
side; the route layer is thin. Writes are reached only through routes the admin
middleware guards by HTTP method.
"""

from __future__ import annotations

from sqlalchemy import func
from sqlmodel import Session, select

from app.models import SavedComparison

#: Bounds that keep the store from being abused. Name length is also enforced by
#: a DB check; the per-(season,division) count is enforced here.
MAX_NAME_LENGTH = 60
MAX_COMPARISONS = 50
#: A per-line note is a short human phrase, not an essay.
MAX_NOTE_LENGTH = 500


class InvalidComparison(ValueError):
    """A save rejected before touching the row: empty/oversized name."""


class ComparisonLimitExceeded(ValueError):
    """A save that would exceed the per-(season,division) count."""


class UnknownLine(ValueError):
    """A line-note write for a line code not in the division's line set."""


def list_comparisons(
    session: Session, season_year: int, division_code: str
) -> list[SavedComparison]:
    """Every comparison for a (season, division), ordered by name so the list is
    stable between requests."""
    return list(
        session.exec(
            select(SavedComparison)
            .where(
                SavedComparison.season_year == season_year,
                SavedComparison.division_code == division_code,
            )
            .order_by(SavedComparison.name)
        ).all()
    )


def save_comparison(
    session: Session,
    season_year: int,
    division_code: str,
    name: str,
    team_a_code: str,
    lineup_a_id: int,
    team_b_code: str,
    lineup_b_id: int,
) -> SavedComparison:
    """Store a comparison's references under a name.

    A name colliding with an existing comparison for this (season, division)
    overwrites it: the (season_year, division_code, name) triple is unique, so
    re-saving under the same name updates rather than piling up duplicates.
    """
    name = name.strip()
    if not name:
        raise InvalidComparison("comparison name cannot be empty")
    if len(name) > MAX_NAME_LENGTH:
        raise InvalidComparison(f"comparison name over {MAX_NAME_LENGTH} characters")

    existing = session.exec(
        select(SavedComparison).where(
            SavedComparison.season_year == season_year,
            SavedComparison.division_code == division_code,
            SavedComparison.name == name,
        )
    ).one_or_none()

    if existing is not None:
        # An update, not a new row — never counts against the cap.
        existing.team_a_code = team_a_code
        existing.lineup_a_id = lineup_a_id
        existing.team_b_code = team_b_code
        existing.lineup_b_id = lineup_b_id
        # Bump the write clock: the DB default only fires on INSERT.
        existing.updated_at = func.now()
        row = existing
    else:
        if len(list_comparisons(session, season_year, division_code)) >= MAX_COMPARISONS:
            raise ComparisonLimitExceeded(
                f"a division may keep at most {MAX_COMPARISONS} comparisons"
            )
        row = SavedComparison(
            season_year=season_year,
            division_code=division_code,
            name=name,
            team_a_code=team_a_code,
            lineup_a_id=lineup_a_id,
            team_b_code=team_b_code,
            lineup_b_id=lineup_b_id,
            line_notes={},
        )
        session.add(row)

    session.commit()
    session.refresh(row)
    return row


def set_line_note(
    session: Session,
    season_year: int,
    division_code: str,
    comparison_id: int,
    line_code: str,
    text: str,
    allowed_lines: set[str],
) -> SavedComparison | None:
    """Set one line's note (single, overwritable). Empty text removes that line
    key. `line_code` must be one of the division's line codes. Scoped by
    (season, division) so an id cannot reach another division's comparison; a
    missing id returns None (the route maps it to 404)."""
    if line_code not in allowed_lines:
        raise UnknownLine(f"unknown line: {line_code}")
    text = text.strip()
    if len(text) > MAX_NOTE_LENGTH:
        raise InvalidComparison(f"note over {MAX_NOTE_LENGTH} characters")

    row = session.exec(
        select(SavedComparison).where(
            SavedComparison.id == comparison_id,
            SavedComparison.season_year == season_year,
            SavedComparison.division_code == division_code,
        )
    ).one_or_none()
    if row is None:
        return None

    # Reassign a NEW dict rather than mutating in place: SQLAlchemy tracks JSONB
    # changes by identity, so an in-place edit can be missed on commit.
    notes = dict(row.line_notes)
    if text:
        notes[line_code] = text
    else:
        notes.pop(line_code, None)
    row.line_notes = notes
    row.updated_at = func.now()

    session.add(row)
    session.commit()
    session.refresh(row)
    return row


def delete_comparison(
    session: Session, season_year: int, division_code: str, comparison_id: int
) -> None:
    """Remove one comparison. Scoped by (season, division) so an id cannot reach
    another division's; a missing id is a no-op, not an error."""
    row = session.exec(
        select(SavedComparison).where(
            SavedComparison.id == comparison_id,
            SavedComparison.season_year == season_year,
            SavedComparison.division_code == division_code,
        )
    ).one_or_none()
    if row is None:
        return
    session.delete(row)
    session.commit()
