"""Saved opponent comparisons: read + protected writes.

GET (list) is a read behind the backend secret; POST/DELETE are writes, guarded
by the method-keyed admin middleware without declaring anything here — the same
subtractive guarantee the rest of the app relies on.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.compare.saved import (
    ComparisonLimitExceeded,
    InvalidComparison,
    UnknownLine,
    delete_comparison,
    list_comparisons,
    save_comparison,
    set_line_note,
)
from app.db import get_session
from app.models import Division, DivisionLine

router = APIRouter(prefix="/api", tags=["compare"])

_BASE = "/seasons/{year}/divisions/{code}/comparisons"


class ComparisonIn(BaseModel):
    name: str
    team_a_code: str
    lineup_a_id: int
    team_b_code: str
    lineup_b_id: int


class LineNoteIn(BaseModel):
    line_code: str
    text: str


class ComparisonOut(BaseModel):
    id: int
    name: str
    team_a_code: str
    lineup_a_id: int
    team_b_code: str
    lineup_b_id: int
    line_notes: dict[str, str]
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


def _require_division(session: Session, year: int, code: str) -> int:
    division = session.exec(
        select(Division).where(
            Division.season_year == year, Division.code == code
        )
    ).one_or_none()
    if division is None:
        raise HTTPException(status_code=404, detail="division not found")
    return division.id


def _line_codes(session: Session, division_id: int) -> set[str]:
    return {
        row.code
        for row in session.exec(
            select(DivisionLine).where(DivisionLine.division_id == division_id)
        ).all()
    }


def _out(row) -> ComparisonOut:
    return ComparisonOut(
        id=row.id, name=row.name,
        team_a_code=row.team_a_code, lineup_a_id=row.lineup_a_id,
        team_b_code=row.team_b_code, lineup_b_id=row.lineup_b_id,
        line_notes=row.line_notes,
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.get(_BASE, response_model=list[ComparisonOut])
def list_division_comparisons(
    year: int, code: str, session: Session = Depends(get_session)
) -> list[ComparisonOut]:
    _require_division(session, year, code)
    return [_out(r) for r in list_comparisons(session, year, code)]


@router.post(_BASE, response_model=ComparisonOut, status_code=201)
def save_division_comparison(
    year: int, code: str, body: ComparisonIn,
    session: Session = Depends(get_session),
) -> ComparisonOut:
    _require_division(session, year, code)
    try:
        row = save_comparison(
            session, year, code, body.name,
            body.team_a_code, body.lineup_a_id,
            body.team_b_code, body.lineup_b_id,
        )
    except InvalidComparison as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except ComparisonLimitExceeded as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return _out(row)


@router.post(_BASE + "/{comparison_id}/line-note", response_model=ComparisonOut)
def set_comparison_line_note(
    year: int, code: str, comparison_id: int, body: LineNoteIn,
    session: Session = Depends(get_session),
) -> ComparisonOut:
    division_id = _require_division(session, year, code)
    try:
        row = set_line_note(
            session, year, code, comparison_id,
            body.line_code, body.text, _line_codes(session, division_id),
        )
    except UnknownLine as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except InvalidComparison as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if row is None:
        raise HTTPException(status_code=404, detail="comparison not found")
    return _out(row)


@router.delete(_BASE + "/{comparison_id}", status_code=204)
def delete_division_comparison(
    year: int, code: str, comparison_id: int,
    session: Session = Depends(get_session),
) -> Response:
    _require_division(session, year, code)
    delete_comparison(session, year, code, comparison_id)
    return Response(status_code=204)
