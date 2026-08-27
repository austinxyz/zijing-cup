import os
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse

SECRET_HEADER = "X-Backend-Secret"

# /health has to answer without the shared secret: Render's own platform
# health check cannot be configured to send a custom header, and if this
# route required it, Render would see every check as a 401 and treat the
# service as unhealthy.
EXEMPT_PATHS = {"/health"}


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

    return await call_next(request)


def _unauthorized() -> JSONResponse:
    return JSONResponse(status_code=401, content={"detail": "unauthorized"})
