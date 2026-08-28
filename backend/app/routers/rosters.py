"""Read-only routes for teams and rosters.

Deliberately no write methods. Rosters change once a season through a reviewed
CSV and the import command; this app has no per-user login, so an HTTP write
path would let anyone overwrite every team's roster.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.rosters.query import TeamRosterOut, TeamSummaryOut, get_team_roster, list_teams

router = APIRouter(prefix="/api", tags=["rosters"])


@router.get(
    "/seasons/{year}/divisions/{code}/teams",
    response_model=list[TeamSummaryOut],
)
def read_teams(
    year: int,
    code: str,
    session: Session = Depends(get_session),
) -> list[TeamSummaryOut]:
    teams = list_teams(session, year, code)
    if teams is None:
        raise HTTPException(status_code=404, detail="division not found")
    return teams


@router.get(
    "/seasons/{year}/divisions/{code}/teams/{team_code}/roster",
    response_model=TeamRosterOut,
)
def read_team_roster(
    year: int,
    code: str,
    team_code: str,
    session: Session = Depends(get_session),
) -> TeamRosterOut:
    roster = get_team_roster(session, year, code, team_code)
    if roster is None:
        # 404, never an empty player list: "no such team" and "a team with no
        # players" are different claims and only one of them is true.
        raise HTTPException(status_code=404, detail="team not found")
    return roster
