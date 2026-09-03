"""The read-only lineup search route.

GET only, and locks and exclusions travel in the query string. Nothing about
a lineup is stored: it is recomputed from the roster and the division's rules
on every request, so there is nothing for a write method to write. The same
choice makes a search shareable — the URL is the whole request.

The route reads the database, calls the pure engine, and hands back what it
returned. No constraint or search logic lives here.
"""

import re
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.lineups.presets import (
    InvalidPreset,
    PresetLimitExceeded,
    delete_preset,
    list_presets,
    save_preset,
)
from app.lineups.query import (
    LineupSearchOut,
    UnknownReference,
    ViolationOut,
    load_roster,
    load_ruleset,
    search_team_lineups,
)
from app.lineups.saved import (
    InvalidSavedLineup,
    SavedLineupLimitExceeded,
    UnknownAssignmentKey,
    assignment_violations,
    delete_saved_lineup,
    list_saved_lineups,
    revalidate_saved,
    save_lineup,
)
from app.models import Team

router = APIRouter(prefix="/api", tags=["lineups"])

#: A key from before the read-path switch: `roster_entries.id`, a bare
#: integer. Current keys carry a `p` prefix.
_OLD_KEY = re.compile(r"\d+")

STALE_LINK_DETAIL = (
    "这个链接是旧格式（队员编号已变），请重新选择锁定的搭档"
)


def _reject_old_keys(keys: list[str]) -> None:
    """Refuse pre-switch keys by name rather than as "unknown player".

    Both id spaces are small integers, so a stale key can name a real player
    who is simply not the one the link meant. Saying "unknown player" would
    send the reader looking for a typo; the link is the problem.
    """
    if any(_OLD_KEY.fullmatch(key) for key in keys):
        raise UnknownReference(STALE_LINK_DETAIL)


def _parse_pins(raw: list[str]) -> dict[str, str]:
    """One `LINE:playerKey` per pinned line — a single key, not a pair.

    Kept separate from lock parsing on purpose: `_parse_locks` treats anything
    that is not exactly two keys as malformed, and overloading it would blur a
    mistyped lock with a deliberate pin.
    """
    pins: dict[str, str] = {}
    for item in raw:
        line, separator, key = item.partition(":")
        if not line or not separator or not key or "," in key:
            raise UnknownReference(f"malformed pin: {item}")
        if line in pins:
            raise UnknownReference(f"line pinned twice: {line}")
        _reject_old_keys([key])
        pins[line] = key
    return pins


def _parse_locks(raw: list[str]) -> dict[str, tuple[str, str]]:
    """One `LINE:playerKey,playerKey` per locked line.

    A malformed value is refused, never skipped: a caller whose lock was
    dropped would read the answer as being about the lineup they asked for.
    """
    locks: dict[str, tuple[str, str]] = {}
    for item in raw:
        line, separator, players = item.partition(":")
        keys = players.split(",")
        if not line or not separator or len(keys) != 2 or not all(keys):
            raise UnknownReference(f"malformed lock: {item}")
        if line in locks:
            raise UnknownReference(f"line locked twice: {line}")
        _reject_old_keys(keys)
        locks[line] = (keys[0], keys[1])
    return locks


@router.get(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/lineups",
    response_model=LineupSearchOut,
)
def search_lineups_for_team(
    year: int,
    code: str,
    team_code: str,
    lock: Optional[list[str]] = Query(
        default=None,
        description="A locked line, as LINE:playerKey,playerKey. Repeatable.",
    ),
    exclude: Optional[list[str]] = Query(
        default=None,
        description="A player key unavailable for this match. Repeatable.",
    ),
    pin: Optional[list[str]] = Query(
        default=None,
        description="A player pinned to a line, as LINE:playerKey. The engine "
        "chooses the partner. Repeatable, one per line.",
    ),
    session: Session = Depends(get_session),
) -> LineupSearchOut:
    try:
        _reject_old_keys(list(exclude or []))
        result = search_team_lineups(
            session,
            year,
            code,
            team_code,
            locks=_parse_locks(lock or []),
            excluded=list(exclude or []),
            pins=_parse_pins(pin or []),
        )
    except UnknownReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if result is None:
        # 404, never an empty candidate list: "no such team" and "this team
        # cannot field a legal lineup" are different answers, and the second
        # one has its own field.
        raise HTTPException(status_code=404, detail="team not found")
    return result


# --- Saved filter presets ---------------------------------------------------
#
# Named locks+exclusions per team. GET is a read (no admin); POST/DELETE are
# writes, protected by the method-keyed admin middleware without declaring
# anything here — the same subtractive guarantee the rest of the app relies on.

_PRESETS = "/seasons/{year}/divisions/{code}/teams/{team_code}/presets"


class PresetIn(BaseModel):
    name: str
    #: {"locks": {"D1": ["p12","p34"], ...}, "excluded": ["p56", ...]}
    constraints: dict[str, Any]


class PresetOut(BaseModel):
    id: int
    name: str
    constraints: dict[str, Any]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def _resolve_team(session: Session, year: int, code: str, team_code: str) -> int:
    team = session.exec(
        select(Team).where(
            Team.season_year == year,
            Team.division_code == code,
            Team.code == team_code,
        )
    ).one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="team not found")
    return team.id


@router.get(_PRESETS, response_model=list[PresetOut])
def list_team_presets(
    year: int, code: str, team_code: str,
    session: Session = Depends(get_session),
) -> list[PresetOut]:
    team_id = _resolve_team(session, year, code, team_code)
    return [
        PresetOut(
            id=p.id, name=p.name, constraints=p.constraints,
            created_at=p.created_at, updated_at=p.updated_at,
        )
        for p in list_presets(session, team_id)
    ]


@router.post(_PRESETS, response_model=PresetOut, status_code=201)
def save_team_preset(
    year: int, code: str, team_code: str, body: PresetIn,
    session: Session = Depends(get_session),
) -> PresetOut:
    team_id = _resolve_team(session, year, code, team_code)
    try:
        preset = save_preset(session, team_id, body.name, body.constraints)
    except InvalidPreset as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except PresetLimitExceeded as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return PresetOut(
        id=preset.id, name=preset.name, constraints=preset.constraints,
        created_at=preset.created_at, updated_at=preset.updated_at,
    )


@router.delete(_PRESETS + "/{preset_id}", status_code=204)
def delete_team_preset(
    year: int, code: str, team_code: str, preset_id: int,
    session: Session = Depends(get_session),
) -> Response:
    team_id = _resolve_team(session, year, code, team_code)
    delete_preset(session, team_id, preset_id)
    return Response(status_code=204)


# --- Saved lineups: validate an assignment ----------------------------------
#
# POST (a write method) so the shared-secret admin middleware guards it — the
# only caller is the admin lineup editor. It reuses the engine's check_lineup
# against CURRENT participation UTRs; it stores nothing.

_SAVED = "/seasons/{year}/divisions/{code}/teams/{team_code}/saved-lineups"


class ValidateAssignmentIn(BaseModel):
    #: {"D1": ["p12", "p34"], ...}
    assignment: dict[str, list[str]]


class ValidateAssignmentOut(BaseModel):
    violations: list[ViolationOut]


@router.post(_SAVED + "/validate", response_model=ValidateAssignmentOut)
def validate_saved_assignment(
    year: int, code: str, team_code: str, body: ValidateAssignmentIn,
    session: Session = Depends(get_session),
) -> ValidateAssignmentOut:
    rules = load_ruleset(session, year, code)
    if rules is None:
        raise HTTPException(status_code=404, detail="division not found")
    loaded = load_roster(session, year, code, team_code)
    if loaded is None:
        raise HTTPException(status_code=404, detail="team not found")

    keys = [key for pair in body.assignment.values() for key in pair]
    try:
        _reject_old_keys(keys)
        roster = {c.key: c for c in loaded.candidates}
        violations = assignment_violations(rules, roster, body.assignment)
    except UnknownReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except UnknownAssignmentKey as error:
        raise HTTPException(
            status_code=422, detail=f"unknown player: {error}"
        ) from error

    return ValidateAssignmentOut(
        violations=[
            ViolationOut(code=v.code, line=v.line, amount=v.amount, message=v.message)
            for v in violations
        ]
    )


# --- Saved lineups: CRUD + server-side revalidation --------------------------
#
# GET lists and re-judges each saved lineup against the CURRENT participation
# UTRs (open, no admin). POST/PUT/DELETE are writes the admin middleware guards.
# The snapshot is built server-side at save time and never written back to a UTR.


class SavedLineupIn(BaseModel):
    name: str
    assignment: dict[str, list[str]]


class SaveBackIn(BaseModel):
    assignment: dict[str, list[str]]


class SavedLineupOut(BaseModel):
    id: int
    name: str
    assignment: dict[str, list[str]]
    utr_snapshot: dict[str, str]
    #: "valid" | "utr_moved" | "illegal" | "player_gone"
    status: str
    violations: list[ViolationOut] = []
    #: key -> {"name","snapshot","current"} for players whose UTR changed
    utr_diff: dict[str, dict[str, str]] = {}
    missing: list[str] = []


def _current_roster(session: Session, year: int, code: str, team_code: str):
    """(rules, {key: Candidate}) for the team's current participation UTRs, or
    (None, None) when the division or team is unknown."""
    rules = load_ruleset(session, year, code)
    if rules is None:
        return None, None
    loaded = load_roster(session, year, code, team_code)
    if loaded is None:
        return None, None
    return rules, {c.key: c for c in loaded.candidates}


def _snapshot_for(assignment: dict[str, list[str]], roster) -> dict[str, str]:
    """Each named player's current participation UTR, as a string. Read-only
    history — never written back to a player."""
    snap: dict[str, str] = {}
    for pair in assignment.values():
        for key in pair:
            if key in roster:
                snap[key] = str(roster[key].match_utr)
    return snap


@router.get(_SAVED, response_model=list[SavedLineupOut])
def list_team_saved_lineups(
    year: int, code: str, team_code: str,
    session: Session = Depends(get_session),
) -> list[SavedLineupOut]:
    team_id = _resolve_team(session, year, code, team_code)
    rules, roster = _current_roster(session, year, code, team_code)
    out: list[SavedLineupOut] = []
    for s in list_saved_lineups(session, team_id):
        status = revalidate_saved(rules, roster, s.assignment, s.utr_snapshot)
        out.append(SavedLineupOut(
            id=s.id, name=s.name, assignment=s.assignment,
            utr_snapshot=s.utr_snapshot, status=status.status,
            violations=[
                ViolationOut(code=v.code, line=v.line, amount=v.amount, message=v.message)
                for v in status.violations
            ],
            utr_diff=status.utr_diff, missing=status.missing,
        ))
    return out


def _saved_out(session, year, code, team_code, s) -> SavedLineupOut:
    rules, roster = _current_roster(session, year, code, team_code)
    status = revalidate_saved(rules, roster, s.assignment, s.utr_snapshot)
    return SavedLineupOut(
        id=s.id, name=s.name, assignment=s.assignment,
        utr_snapshot=s.utr_snapshot, status=status.status,
        violations=[
            ViolationOut(code=v.code, line=v.line, amount=v.amount, message=v.message)
            for v in status.violations
        ],
        utr_diff=status.utr_diff, missing=status.missing,
    )


@router.post(_SAVED, response_model=SavedLineupOut, status_code=201)
def save_team_lineup(
    year: int, code: str, team_code: str, body: SavedLineupIn,
    session: Session = Depends(get_session),
) -> SavedLineupOut:
    team_id = _resolve_team(session, year, code, team_code)
    _, roster = _current_roster(session, year, code, team_code)
    snapshot = _snapshot_for(body.assignment, roster or {})
    try:
        saved = save_lineup(session, team_id, body.name, body.assignment, snapshot)
    except InvalidSavedLineup as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except SavedLineupLimitExceeded as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return _saved_out(session, year, code, team_code, saved)


@router.put(_SAVED + "/{saved_id}", response_model=SavedLineupOut)
def save_back_team_lineup(
    year: int, code: str, team_code: str, saved_id: int, body: SaveBackIn,
    session: Session = Depends(get_session),
) -> SavedLineupOut:
    team_id = _resolve_team(session, year, code, team_code)
    existing = next(
        (s for s in list_saved_lineups(session, team_id) if s.id == saved_id), None
    )
    if existing is None:
        raise HTTPException(status_code=404, detail="saved lineup not found")
    _, roster = _current_roster(session, year, code, team_code)
    snapshot = _snapshot_for(body.assignment, roster or {})
    # Same name overwrites in place, re-snapshotting to the current UTRs.
    saved = save_lineup(session, team_id, existing.name, body.assignment, snapshot)
    return _saved_out(session, year, code, team_code, saved)


@router.delete(_SAVED + "/{saved_id}", status_code=204)
def delete_team_saved_lineup(
    year: int, code: str, team_code: str, saved_id: int,
    session: Session = Depends(get_session),
) -> Response:
    team_id = _resolve_team(session, year, code, team_code)
    delete_saved_lineup(session, team_id, saved_id)
    return Response(status_code=204)
