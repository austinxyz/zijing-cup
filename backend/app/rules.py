"""Assemble one division's complete rule set.

The rules page is a Server Component doing a single fetch, so one response
carries everything it renders. Three queries — division, its lines, its
eligibility limits — never one per line.

No caching. The data is tiny and changes once a year, and a cache added now
would mask exactly the thing this first slice is meant to prove: that the
Next.js -> FastAPI -> Supabase path works against real data.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import Division, DivisionEligibilityLimit, DivisionLine, Season


class SeasonOut(BaseModel):
    year: int
    edition_name: Optional[str] = None


class DivisionOut(BaseModel):
    code: str
    display_name: str

    # 'match_count' (count line wins) or 'points' (weighted score).
    scoring_mode: str

    # Two allowances, kept separate all the way to the client: each line may
    # exceed its cap by at most buffer_per_line, AND the overages across the
    # whole lineup may not exceed buffer_total. A client that only saw one
    # number would happily build a lineup with five small overages summing
    # past the budget.
    buffer_per_line: Decimal
    buffer_total: Decimal

    partner_gap_max: Decimal
    mens_doubles_must_be_ordered: bool


class LineOut(BaseModel):
    code: str
    kind: str
    sort_order: int

    # None means open line — no ceiling at all, not a high one. Serialises as
    # JSON null so a consumer can tell the two apart.
    cap: Optional[Decimal] = None

    points: int


class EligibilityLimitOut(BaseModel):
    gender: str
    utr_above: Decimal
    max_players: int

    # None means any line; a list names the only lines those players may
    # occupy (gold: UTR>9.0 men are confined to D1 and MD).
    restricted_to_lines: Optional[list[str]] = None


class DivisionSummaryOut(BaseModel):
    code: str
    display_name: str


class SeasonIndexOut(BaseModel):
    """One season and the divisions that ran in it.

    The sidebar's season/division switcher is built from this. Without it the
    frontend would have to hardcode which seasons exist — the same
    code-constant this change exists to eliminate, just moved one layer out.
    """

    year: int
    edition_name: Optional[str] = None
    divisions: list[DivisionSummaryOut]


class DivisionRulesOut(BaseModel):
    season: SeasonOut
    division: DivisionOut
    lines: list[LineOut]
    eligibility_limits: list[EligibilityLimitOut]


def get_division_rules(
    session: Session, year: int, code: str
) -> Optional[DivisionRulesOut]:
    """Return the rule set, or None when that season/division pair does not
    exist. The caller turns None into a 404 — never an empty rule set, which
    a page would render as "no limits at all"."""
    division = session.exec(
        select(Division).where(Division.season_year == year, Division.code == code)
    ).one_or_none()
    if division is None:
        return None

    season = session.get(Season, year)
    if season is None:
        # A division always has its season (foreign key), so this would mean
        # the row was deleted underneath us rather than a bad request.
        return None

    lines = session.exec(
        select(DivisionLine)
        .where(DivisionLine.division_id == division.id)
        .order_by(DivisionLine.sort_order)
    ).all()

    limits = session.exec(
        select(DivisionEligibilityLimit)
        .where(DivisionEligibilityLimit.division_id == division.id)
        # Strongest restriction first, which is also how the rules are
        # written and how the page lists them.
        .order_by(
            DivisionEligibilityLimit.gender,
            DivisionEligibilityLimit.utr_above.desc(),
        )
    ).all()

    return DivisionRulesOut(
        season=SeasonOut(year=season.year, edition_name=season.edition_name),
        division=DivisionOut(
            code=division.code,
            display_name=division.display_name,
            scoring_mode=division.scoring_mode,
            buffer_per_line=division.buffer_per_line,
            buffer_total=division.buffer_total,
            partner_gap_max=division.partner_gap_max,
            mens_doubles_must_be_ordered=division.mens_doubles_must_be_ordered,
        ),
        lines=[
            LineOut(
                code=line.code,
                kind=line.kind,
                sort_order=line.sort_order,
                cap=line.cap,
                points=line.points,
            )
            for line in lines
        ],
        eligibility_limits=[
            EligibilityLimitOut(
                gender=limit.gender,
                utr_above=limit.utr_above,
                max_players=limit.max_players,
                restricted_to_lines=limit.restricted_to_lines,
            )
            for limit in limits
        ],
    )


def list_seasons(session: Session) -> list[SeasonIndexOut]:
    """Newest season first — the switcher opens on the current one."""
    seasons = session.exec(select(Season).order_by(Season.year.desc())).all()
    divisions = session.exec(
        select(Division).order_by(Division.season_year.desc(), Division.code)
    ).all()

    by_year: dict[int, list[Division]] = {}
    for division in divisions:
        by_year.setdefault(division.season_year, []).append(division)

    return [
        SeasonIndexOut(
            year=season.year,
            edition_name=season.edition_name,
            divisions=[
                DivisionSummaryOut(
                    code=division.code, display_name=division.display_name
                )
                for division in by_year.get(season.year, [])
            ],
        )
        for season in seasons
    ]
