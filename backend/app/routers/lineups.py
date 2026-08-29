"""The read-only lineup search route.

GET only, and locks and exclusions travel in the query string. Nothing about
a lineup is stored: it is recomputed from the roster and the division's rules
on every request, so there is nothing for a write method to write. The same
choice makes a search shareable — the URL is the whole request.

The route reads the database, calls the pure engine, and hands back what it
returned. No constraint or search logic lives here.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.db import get_session
from app.lineups.query import LineupSearchOut, UnknownReference, search_team_lineups

router = APIRouter(prefix="/api", tags=["lineups"])


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
    session: Session = Depends(get_session),
) -> LineupSearchOut:
    try:
        result = search_team_lineups(
            session,
            year,
            code,
            team_code,
            locks=_parse_locks(lock or []),
            excluded=list(exclude or []),
        )
    except UnknownReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if result is None:
        # 404, never an empty candidate list: "no such team" and "this team
        # cannot field a legal lineup" are different answers, and the second
        # one has its own field.
        raise HTTPException(status_code=404, detail="team not found")
    return result
