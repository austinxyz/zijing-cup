"""SQLModel mapping for saved opponent comparisons.

The schema is owned by `supabase/migrations/`; this mirrors it.

A comparison stores REFERENCES (team codes + saved_lineup ids), not a snapshot:
展开查看 recomputes from the referenced lineups' current state. `lineup_a_id`/
`lineup_b_id` are plain ints with NO foreign key on purpose — deleting a saved
lineup must leave the comparison standing (shown as "阵容已删"), not cascade it
away. `line_notes` is a JSONB map {line_code: text}, read and written whole.

`created_at`/`updated_at` use an explicit server_default (NOT NULL + DB default);
a plain `Optional[datetime] = None` would make SQLModel send an explicit NULL on
insert (a NotNullViolation).
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class SavedComparison(SQLModel, table=True):
    __tablename__ = "saved_comparisons"
    __table_args__ = {"schema": SCHEMA}

    id: Optional[int] = Field(default=None, primary_key=True)
    season_year: int = Field(foreign_key=f"{SCHEMA}.seasons.year")
    division_code: str

    name: str

    #: References, not snapshots. Team codes are the sheet's own strings (as
    #: elsewhere); lineup ids are plain ints — NO FK, so a deleted saved lineup
    #: leaves this row intact and 展开 shows "阵容已删".
    team_a_code: str
    lineup_a_id: int
    team_b_code: str
    lineup_b_id: int

    #: {line_code: text}. One editable note per line; read/written whole.
    line_notes: dict[str, str] = Field(
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
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
