"""Store, list, and delete named lineup filter presets.

A preset is a team's saved locks + exclusions (the URL query params), nothing
more. These functions own the database side; the route layer is thin. Writes
are reached only through routes the admin middleware guards by HTTP method.
"""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app.models import LineupFilterPreset

#: Bounds that keep the store from being abused. Name length is also enforced
#: by a DB check; the per-team count is enforced here.
MAX_NAME_LENGTH = 60
MAX_PRESETS_PER_TEAM = 50


class InvalidPreset(ValueError):
    """A save the store rejects before touching the row: empty/oversized name."""


class PresetLimitExceeded(ValueError):
    """A save that would exceed the per-team count or the name length."""


def list_presets(session: Session, team_id: int) -> list[LineupFilterPreset]:
    """Every preset for a team, newest name-collisions already resolved.

    Ordered by name so the list is stable between requests.
    """
    return list(
        session.exec(
            select(LineupFilterPreset)
            .where(LineupFilterPreset.team_id == team_id)
            .order_by(LineupFilterPreset.name)
        ).all()
    )


def save_preset(
    session: Session,
    team_id: int,
    name: str,
    constraints: dict[str, Any],
) -> LineupFilterPreset:
    """Store a preset's name and constraints for a team.

    A name colliding with an existing preset for this team overwrites it: the
    (team_id, name) pair is unique, so a captain re-saving under the same name
    updates rather than piling up duplicates.
    """
    name = name.strip()
    if not name:
        raise InvalidPreset("preset name cannot be empty")
    if len(name) > MAX_NAME_LENGTH:
        raise InvalidPreset(f"preset name over {MAX_NAME_LENGTH} characters")

    existing = session.exec(
        select(LineupFilterPreset).where(
            LineupFilterPreset.team_id == team_id,
            LineupFilterPreset.name == name,
        )
    ).one_or_none()

    if existing is not None:
        # An update, not a new row — never counts against the per-team cap.
        existing.constraints = constraints
        preset = existing
    else:
        if len(list_presets(session, team_id)) >= MAX_PRESETS_PER_TEAM:
            raise PresetLimitExceeded(
                f"a team may keep at most {MAX_PRESETS_PER_TEAM} presets"
            )
        preset = LineupFilterPreset(
            team_id=team_id, name=name, constraints=constraints
        )
        session.add(preset)

    session.commit()
    session.refresh(preset)
    return preset


def delete_preset(session: Session, team_id: int, preset_id: int) -> None:
    """Remove one preset. Scoped by team_id so an id cannot reach another
    team's preset; a missing id is a no-op, not an error."""
    preset = session.exec(
        select(LineupFilterPreset).where(
            LineupFilterPreset.id == preset_id,
            LineupFilterPreset.team_id == team_id,
        )
    ).one_or_none()
    if preset is None:
        return
    session.delete(preset)
    session.commit()
