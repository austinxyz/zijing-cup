import os
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse

SECRET_HEADER = "X-Backend-Secret"
ADMIN_HEADER = "X-Admin-Secret"

# Keyed on the method, not on a route prefix. A prefix convention ("everything
# under /api/admin is protected") relies on whoever adds the next route
# remembering the convention; the method is a property of the request itself
# and cannot be forgotten. A write route that legitimately needs to be open
# would be an explicit exemption here, the way /health already is.
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

# /health has to answer without the shared secret: Render's own platform
# health check cannot be configured to send a custom header. /docs, /redoc,
# and /openapi.json also need to be exempt so ENABLE_API_DOCS actually works
# in a browser (which likewise can't send the header) — when docs are
# disabled these routes don't exist at all, so exempting them is harmless.
EXEMPT_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


async def require_shared_secret(request: Request, call_next):
    """Reject anything that does not carry the shared secret.

    Registered as middleware rather than a router dependency so that
    coverage is subtractive: a route added later is protected by default,
    instead of protected only if someone remembers to attach a dependency.

    The two checks below are deliberately kept apart. Folding them into one
    condition — `if expected and provided != expected` — lets every request
    through whenever the variable is unset, which is exactly the deployment
    mistake this is meant to catch. A missing secret must mean "no one gets
    in", not "everyone does".
    """
    if request.url.path in EXEMPT_PATHS:
        return await call_next(request)

    expected = os.environ.get("BACKEND_SECRET")
    if not expected:
        return _unauthorized()

    provided = request.headers.get(SECRET_HEADER)
    if not provided or not secrets.compare_digest(provided, expected):
        return _unauthorized()

    # Second layer, same subtractive shape: a write route added later is
    # covered because it did not opt out. The alternative — a FastAPI
    # dependency attached per route — is additive, and its failure mode is a
    # write endpoint that is quietly open because someone forgot the decorator.
    if request.method.upper() in WRITE_METHODS:
        admin_expected = os.environ.get("ADMIN_SECRET")
        # Split from the comparison below for the same reason as above: folded
        # into one condition, an unset variable would let every write through,
        # which is precisely the deployment mistake worth being closed about.
        if not admin_expected:
            return _forbidden()

        admin_provided = request.headers.get(ADMIN_HEADER)
        if not admin_provided or not secrets.compare_digest(
            admin_provided, admin_expected
        ):
            return _forbidden()

    return await call_next(request)


def _unauthorized() -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": "unauthorized"})


def _forbidden() -> JSONResponse:
    """403 rather than 401: the caller proved it is our own server (it carried
    the shared secret) but is not acting for an admin. Saying 'unauthorized'
    here would send the frontend looking for a broken deployment instead of a
    missing login."""
    return JSONResponse(
        status_code=403, content={"detail": "admin credential required"}
    )
