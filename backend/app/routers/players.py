"""Player endpoints — the project's first write surface.

The admin credential is NOT checked here. It is enforced in
`app/auth.py`'s middleware by HTTP method, so a route added to this file
tomorrow is protected without remembering to ask for it. Anything this module
did per-route would be additive, and additive protection is the kind someone
eventually forgets.

Routes read the database, call `command`/`query`, and translate exceptions into
status codes. No rules live here.
"""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.db import get_session
from app.models import CURRENT_UTR_STATUSES, SEASON_UTR_SOURCES, SEASON_UTR_STATUSES
from app.players import command
from app.players.query import PlayerOut, count_players, get_player, list_players

router = APIRouter(prefix="/api/players", tags=["players"])


def _status_field(allowed: set[str], description: str):
    return Field(default=None, description=f"{description}. One of: {sorted(allowed)}")


class PlayerIn(BaseModel):
    last_name: str = Field(min_length=1)
    first_name: str = Field(min_length=1)
    gender: Optional[str] = None

    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = _status_field(
        CURRENT_UTR_STATUSES, "UTR's own rating state for singles"
    )
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = _status_field(
        CURRENT_UTR_STATUSES, "UTR's own rating state for doubles"
    )
    utr_profile_id: Optional[str] = None


class PlayerPatch(BaseModel):
    last_name: Optional[str] = Field(default=None, min_length=1)
    first_name: Optional[str] = Field(default=None, min_length=1)
    gender: Optional[str] = None
    singles_utr: Optional[Decimal] = None
    singles_status: Optional[str] = None
    doubles_utr: Optional[Decimal] = None
    doubles_status: Optional[str] = None
    utr_profile_id: Optional[str] = None


class MembershipIn(BaseModel):
    team_id: int
    representing_school: Optional[str] = None
    is_borrowed_player: Optional[bool] = None
    is_wildcard: Optional[bool] = None


class MembershipPatch(BaseModel):
    """Change an existing membership's team-level identity fields, located by
    (player, team). Absent field = leave alone (exclude_unset separates that
    from an explicit null)."""

    team_id: int
    representing_school: Optional[str] = None
    is_borrowed_player: Optional[bool] = None
    is_wildcard: Optional[bool] = None


class SeasonUtrIn(BaseModel):
    value: Decimal
    source: str
    status: Optional[str] = None
    under_appeal: bool = False


def _validate_vocabularies(
    gender: Optional[str] = None,
    singles_status: Optional[str] = None,
    doubles_status: Optional[str] = None,
) -> None:
    """Reject an unknown word before the database does.

    The check constraints would catch these too, but as a 500: an IntegrityError
    surfacing from a commit reads as "the server broke", not "you sent a status
    that does not exist".
    """
    if gender is not None and gender not in {"M", "F"}:
        raise HTTPException(status_code=422, detail=f"unknown gender: {gender}")
    for name, value in (
        ("singles_status", singles_status),
        ("doubles_status", doubles_status),
    ):
        if value is not None and value not in CURRENT_UTR_STATUSES:
            raise HTTPException(
                status_code=422, detail=f"unknown {name}: {value}"
            )


@router.get("", response_model=list[PlayerOut])
def read_players(
    response: Response,
    q: Optional[str] = Query(default=None, description="Name or UTR profile id"),
    season: Optional[int] = None,
    team_id: Optional[int] = None,
    unresolved: bool = Query(
        default=False, description="Only players with a contested season value"
    ),
    limit: int = Query(default=200, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> list[PlayerOut]:
    # The total goes in a header rather than wrapping the body in an envelope:
    # every other read route here returns a bare list, and a caller showing a
    # page of 200 out of 375 needs the real number to say so honestly.
    response.headers["X-Total-Count"] = str(
        count_players(
            session,
            query=q,
            season_year=season,
            team_id=team_id,
            unresolved_only=unresolved,
        )
    )
    return list_players(
        session,
        query=q,
        season_year=season,
        team_id=team_id,
        unresolved_only=unresolved,
        limit=limit,
    )


@router.get("/{player_id}", response_model=PlayerOut)
def read_player(
    player_id: int, session: Session = Depends(get_session)
) -> PlayerOut:
    player = get_player(session, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="player not found")
    return player


@router.post("", response_model=PlayerOut, status_code=201)
def create_player(
    payload: PlayerIn, session: Session = Depends(get_session)
) -> PlayerOut:
    _validate_vocabularies(
        payload.gender, payload.singles_status, payload.doubles_status
    )
    player = command.create_player(session, **payload.model_dump())
    return get_player(session, player.id)


@router.patch("/{player_id}", response_model=PlayerOut)
def update_player(
    player_id: int, payload: PlayerPatch, session: Session = Depends(get_session)
) -> PlayerOut:
    fields = payload.model_dump(exclude_unset=True)
    _validate_vocabularies(
        fields.get("gender"),
        fields.get("singles_status"),
        fields.get("doubles_status"),
    )
    try:
        command.update_player(session, player_id, **fields)
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return get_player(session, player_id)


@router.delete("/{player_id}", status_code=204)
def delete_player(
    player_id: int, session: Session = Depends(get_session)
) -> Response:
    try:
        command.delete_player(session, player_id)
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.SeasonLocked as error:
        # 409, not 403: the caller is allowed to delete players in general —
        # this particular one belongs to a season that has been frozen.
        raise HTTPException(status_code=409, detail=str(error)) from error
    return Response(status_code=204)


@router.post("/{player_id}/memberships", status_code=201)
def add_membership(
    player_id: int, payload: MembershipIn, session: Session = Depends(get_session)
):
    try:
        membership = command.add_membership(
            session, player_id, **payload.model_dump()
        )
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"id": membership.id}


@router.patch("/{player_id}/memberships")
def update_membership(
    player_id: int, payload: MembershipPatch, session: Session = Depends(get_session)
):
    fields = payload.model_dump(exclude_unset=True, exclude={"team_id"})
    try:
        membership = command.update_membership(
            session, player_id, payload.team_id, **fields
        )
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {
        "id": membership.id,
        "is_borrowed_player": membership.is_borrowed_player,
        "is_wildcard": membership.is_wildcard,
        "representing_school": membership.representing_school,
    }


@router.delete("/{player_id}/memberships/{membership_id}", status_code=204)
def remove_membership(
    player_id: int, membership_id: int, session: Session = Depends(get_session)
) -> Response:
    try:
        command.remove_membership(session, player_id, membership_id)
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return Response(status_code=204)


@router.put("/{player_id}/season-utrs/{season_year}")
def set_season_utr(
    player_id: int,
    season_year: int,
    payload: SeasonUtrIn,
    session: Session = Depends(get_session),
):
    if payload.source not in SEASON_UTR_SOURCES:
        raise HTTPException(
            status_code=422, detail=f"unknown source: {payload.source}"
        )
    if payload.status is not None and payload.status not in SEASON_UTR_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"unknown status: {payload.status}"
        )

    try:
        row = command.set_season_utr(
            session,
            player_id,
            season_year,
            value=payload.value,
            source=payload.source,
            status=payload.status,
            under_appeal=payload.under_appeal,
        )
    except command.NotFound as error:
        # A season that never happened is the caller's mistake, not a missing
        # page: 422 rather than 404 when the player exists but the year does not.
        status = 404 if "player" in str(error) else 422
        raise HTTPException(status_code=status, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return {
        "season_year": row.season_year,
        "value": str(row.value),
        "alt_value": str(row.alt_value) if row.alt_value is not None else None,
        "is_unresolved": row.is_unresolved,
        "status": row.status,
        "under_appeal": row.under_appeal,
        "source": row.source,
    }


class MergeIn(BaseModel):
    #: The record being absorbed and DELETED. The survivor is the player_id in
    #: the path. Getting these two backwards deletes the wrong person, and this
    #: operation has no undo.
    merge_id: int


class SplitIn(BaseModel):
    last_name: str = Field(min_length=1)
    first_name: str = Field(min_length=1)
    gender: Optional[str] = None
    utr_profile_id: Optional[str] = None

    #: Exactly which rows move. Empty means nothing moves — a split with no
    #: selection creates a second person and leaves every record where it is,
    #: rather than guessing a division.
    membership_ids: list[int] = []
    season_years: list[int] = []


class RulingIn(BaseModel):
    value: Decimal
    status: Optional[str] = None


@router.post("/{player_id}/merge")
def merge_player(
    player_id: int, payload: MergeIn, session: Session = Depends(get_session)
):
    """Fold another record into this one.

    Irreversible: this change ships no undo and no history, so the response
    says what happened rather than leaving the caller to diff the database.
    """
    try:
        report = command.merge_players(
            session, keep_id=player_id, merge_id=payload.merge_id
        )
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return {
        "memberships_moved": report.memberships_moved,
        "season_utrs_moved": report.season_utrs_moved,
        # Seasons that now hold two candidates and need a ruling. Reported
        # because the merge succeeded *and* left work behind — silence here
        # would read as "nothing to do".
        "unresolved_seasons": report.conflicts,
    }


@router.post("/{player_id}/split", status_code=201)
def split_player(
    player_id: int, payload: SplitIn, session: Session = Depends(get_session)
):
    """Split this record into two, moving exactly the rows named. Irreversible."""
    try:
        new_player = command.split_player(
            session,
            player_id=player_id,
            last_name=payload.last_name,
            first_name=payload.first_name,
            membership_ids=payload.membership_ids,
            season_years=payload.season_years,
            gender=payload.gender,
            utr_profile_id=payload.utr_profile_id,
        )
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return get_player(session, new_player.id)


@router.post("/{player_id}/season-utrs/{season_year}/ruling")
def rule_on_season(
    player_id: int,
    season_year: int,
    payload: RulingIn,
    session: Session = Depends(get_session),
):
    """Settle a contested season.

    Separate from the plain PUT because the two say different things: PUT is
    "this is the number", a ruling is "these two sheets disagreed and I choose".
    Only the second one is allowed to clear the unresolved flag by decision.
    """
    if payload.status is not None and payload.status not in SEASON_UTR_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"unknown status: {payload.status}"
        )
    try:
        row = command.rule_on_season_utr(
            session,
            player_id,
            season_year,
            value=payload.value,
            status=payload.status,
        )
    except command.NotFound as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except command.Conflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except command.SeasonLocked as error:
        raise HTTPException(status_code=409, detail=str(error)) from error

    return {
        "season_year": row.season_year,
        "value": str(row.value),
        "alt_value": str(row.alt_value) if row.alt_value is not None else None,
        "is_unresolved": row.is_unresolved,
        "status": row.status,
        "under_appeal": row.under_appeal,
        "source": row.source,
    }
