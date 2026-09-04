"""Team and roster routes.

The roster CONTENT is still read-only: rosters change once a season through a
reviewed CSV and the import command, never an HTTP path. The one write here is a
team-level admin field — school_count (how many schools a 联队 combines) — which
is a human judgement, guarded by the method-keyed admin middleware like every
other write.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import Team
from app.players import command
from app.rosters.query import TeamRosterOut, TeamSummaryOut, get_team_roster, list_teams

router = APIRouter(prefix="/api", tags=["rosters"])


class TeamPatch(BaseModel):
    school_count: Optional[int] = None


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


@router.patch("/seasons/{year}/divisions/{code}/teams/{team_code}")
def patch_team(
    year: int,
    code: str,
    team_code: str,
    payload: TeamPatch,
    session: Session = Depends(get_session),
) -> dict:
    """Set team-level admin fields (school_count). Guarded by the method-keyed
    admin middleware — a PATCH already requires admin credentials."""
    team = session.exec(
        select(Team).where(
            Team.season_year == year,
            Team.division_code == code,
            Team.code == team_code,
        )
    ).one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="team not found")
    fields = payload.model_dump(exclude_unset=True)
    if "school_count" in fields:
        command.set_team_school_count(session, team.id, fields["school_count"])
    return {"school_count": team.school_count}
