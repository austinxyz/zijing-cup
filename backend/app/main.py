import os

from fastapi import FastAPI

from app.auth import require_shared_secret
from app.db import check_db_connection

# Opt in to interactive docs rather than switching them off when the
# environment looks like production — a misread environment leaves docs
# closed either way; the alternative would publish the schema on a bad day.
_docs_enabled = bool(os.environ.get("ENABLE_API_DOCS"))

app = FastAPI(
    title="Zijing Cup Analysis API",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
app.middleware("http")(require_shared_secret)


@app.get("/health")
def health():
    db_ok = check_db_connection()
    return {"status": "ok", "db": "ok" if db_ok else "error"}
