"""SQLModel mapping for match records (played ties).

The schema is owned by `supabase/migrations/`; this mirrors it.

A match record stores a played tie for one (season, division): our team vs an
opponent team in the SAME division, the on-court players for both sides per line,
and each line's win/loss + a free-text note.

Design notes the type hints are load-bearing for:

- `lines` is a JSONB map `{line_code: {our:[keys], opp:[pid|null], outcome, note}}`.
  `our` entries are roster keys (`p{id}`, same as `saved_lineups.assignment`);
  `opp` entries are opponent player ids (int) OR null where a player could not be
  matched to the opponent roster — null means "not recorded", NOT zero. The write
  layer validates each line's shape (outcome enum, two our-keys, opp int|null).
- `source_lineup_id` is a plain nullable int with NO foreign key on purpose:
  it records which saved lineup the admin prefilled from, but the match's own
  snapshot stands on its own — deleting that saved lineup must leave the match
  intact (same reasoning as saved_comparison.lineup_a_id).
- The whole-tie outcome is DERIVED (per division scoring_mode) at read time, never
  stored — a stored score column would be a second source of truth that drifts
  from the per-line results.

`created_at`/`updated_at` use an explicit server_default (NOT NULL + DB default);
a plain `Optional[datetime] = None` would make SQLModel send an explicit NULL on
insert (a NotNullViolation).
"""

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import Column, Date, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class MatchRecord(SQLModel, table=True):
    __tablename__ = "match_records"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)

    #: Scoped to a (season, division), matching how teams/rules are scoped.
    season_year: int = Field(foreign_key=f"{SCHEMA}.seasons.year")
    division_code: str

    #: Both teams must belong to this same (season, division); the write layer
    #: enforces that and that they differ. FK guarantees the team rows exist.
    our_team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")
    opponent_team_id: int = Field(foreign_key=f"{SCHEMA}.teams.id")

    #: Admin-entered date of the tie (not a server clock) — stored as a plain
    #: DATE, so no timezone ambiguity.
    match_date: date = Field(sa_column=Column(Date, nullable=False))

    #: Optional free-text round label ("小组赛第2轮"). None = not recorded.
    round_label: Optional[str] = None

    #: Provenance only: which saved lineup was prefilled from. Plain int, NO FK,
    #: so deleting that lineup leaves this record standing.
    source_lineup_id: Optional[int] = None

    #: {line_code: {our:[keys], opp:[pid|null], outcome, note}} — see module docstring.
    lines: dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, server_default="{}"),
    )

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            server_default=func.now(),
            onupdate=func.now(),
            nullable=False,
        ),
    )
