"""Read-only routes for competition rules.

Deliberately no write methods. Rules change once a year through a reviewed
seed file and the importer; a POST/PATCH here would be a second, unreviewed
path to the same data.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.rules import (
    DivisionRulesOut,
    SeasonIndexOut,
    get_division_rules,
    list_seasons,
)

router = APIRouter(prefix="/api", tags=["rules"])


@router.get("/seasons", response_model=list[SeasonIndexOut])
def read_seasons(session: Session = Depends(get_session)) -> list[SeasonIndexOut]:
    """Which seasons and divisions exist. Drives the sidebar switcher."""
    return list_seasons(session)


@router.get(
    "/seasons/{year}/divisions/{code}/rules",
    response_model=DivisionRulesOut,
)
def read_division_rules(
    year: int,
    code: str,
    session: Session = Depends(get_session),
) -> DivisionRulesOut:
    rules = get_division_rules(session, year, code)
    if rules is None:
        # 404 rather than an empty rule set: a page that rendered "no limits"
        # for a mistyped division would be worse than an error.
        raise HTTPException(status_code=404, detail="rule set not found")
    return rules

