"""SQLModel mapping for daily UTR samples (参赛 UTR 采样).

The schema is owned by `supabase/migrations/`; this mirrors it. One row per
`(season_year, player_id, sample_date)`: the player's current doubles UTR +
status as it stood the day it was snapshotted. The participation UTR is the
mean of the rated days across the 9/21-9/25 window.

`doubles_utr`/`doubles_status` are nullable — a player may be unrated (no value)
on a given day. `created_at` uses a server_default (NOT NULL with a DB default)
so an insert need not send it and the timestamp is the database's clock.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, func
from sqlalchemy.types import Numeric
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class PlayerDailyUtr(SQLModel, table=True):
    __tablename__ = "player_daily_utr"
    __table_args__ = ({"schema": SCHEMA},)

    id: Optional[int] = Field(default=None, primary_key=True)
    season_year: int = Field(foreign_key=f"{SCHEMA}.seasons.year")
    player_id: int = Field(
        sa_column=Column(
            ForeignKey(f"{SCHEMA}.players.id", ondelete="CASCADE"), nullable=False
        )
    )
    sample_date: date
    doubles_utr: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric, nullable=True)
    )
    doubles_status: Optional[str] = None
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
