"""The read-only lineup search route.

GET only, and locks and exclusions travel in the query string. Nothing about
a lineup is stored: it is recomputed from the roster and the division's rules
on every request, so there is nothing for a write method to write. The same
choice makes a search shareable — the URL is the whole request.

The route reads the database, calls the pure engine, and hands back what it
returned. No constraint or search logic lives here.
"""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.db import get_session
from app.lineups.query import LineupSearchOut, UnknownReference, search_team_lineups

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
        )
    except UnknownReference as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    if result is None:
        # 404, never an empty candidate list: "no such team" and "this team
        # cannot field a legal lineup" are different answers, and the second
        # one has its own field.
        raise HTTPException(status_code=404, detail="team not found")
    return result
