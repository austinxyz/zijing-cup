"""Per-competition admin password credentials: read the hash, upsert the hash.

The backend stores and returns an opaque `salt:hash` string; it never computes
or checks a password — that is the Next side's job. GET is guarded by the
shared-secret middleware (X-Backend-Secret), so only the Next server can read a
hash, which is what lets it be read during login before any user is
authenticated. PUT is a write, so the same middleware also requires
X-Admin-Secret — no per-route declaration needed.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import AdminCredential

router = APIRouter(prefix="/api", tags=["admin-credentials"])

_PATH = "/seasons/{year}/divisions/{code}/admin-credential"


class AdminCredentialOut(BaseModel):
    password_hash: str


class AdminCredentialIn(BaseModel):
    password_hash: str


@router.get(_PATH, response_model=AdminCredentialOut)
def read_admin_credential(
    year: int, code: str, session: Session = Depends(get_session)
) -> AdminCredentialOut:
    row = session.exec(
        select(AdminCredential).where(
            AdminCredential.season_year == year,
            AdminCredential.division_code == code,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="no credential for this competition")
    return AdminCredentialOut(password_hash=row.password_hash)


@router.put(_PATH, response_model=AdminCredentialOut)
def upsert_admin_credential(
    year: int, code: str, payload: AdminCredentialIn,
    session: Session = Depends(get_session),
) -> AdminCredentialOut:
    row = session.exec(
        select(AdminCredential).where(
            AdminCredential.season_year == year,
            AdminCredential.division_code == code,
        )
    ).one_or_none()
    if row is None:
        row = AdminCredential(
            season_year=year, division_code=code, password_hash=payload.password_hash
        )
    else:
        row.password_hash = payload.password_hash
    session.add(row)
    session.commit()
    return AdminCredentialOut(password_hash=payload.password_hash)
