"""SQLModel mapping for per-competition admin password credentials.

The schema is owned by `supabase/migrations/`; this mirrors it. One row per
(season, division). `password_hash` is an opaque `salt:hash` string produced and
verified only on the Next side — the backend stores and returns it and NEVER
computes or checks a password. `updated_at` uses a server_default (NOT NULL with
a database default) so an insert need not send it and the timestamp is the
database's clock.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, UniqueConstraint, func
from sqlmodel import Field, SQLModel

from app.db import SCHEMA


class AdminCredential(SQLModel, table=True):
    __tablename__ = "admin_credentials"
    __table_args__ = (
        UniqueConstraint("season_year", "division_code", name="uq_admin_cred_competition"),
        {"schema": SCHEMA},
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    season_year: int
    division_code: str
    #: scrypt `salt:hash` from the Next side. Opaque here.
    password_hash: str
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True), server_default=func.now(), nullable=False
        ),
    )
