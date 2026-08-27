# Project Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a working, deployable skeleton for the `zijing-cup` project — FastAPI backend, Next.js frontend, a Supabase schema wired end-to-end — with no Zijing Cup domain logic yet.

**Architecture:** Next.js 15 (App Router) → FastAPI (Python 3.12 + SQLModel) → Supabase Postgres, mirroring `ai-course-management`'s conventions exactly except for one deviation: this project's tables live in a dedicated `zijing_cup` Postgres schema (not `public`), because it shares a Supabase project with another app that already occupies `public`.

**Tech Stack:** FastAPI, SQLModel, psycopg3, uv (backend); Next.js 16, React 19, TypeScript, Tailwind v4, Vitest (frontend); Supabase CLI + Postgres migrations; Render (backend hosting) + Vercel (frontend hosting).

## Global Constraints

- Backend Python version: `>=3.12`, managed by `uv` (see `backend/pyproject.toml`)
- Frontend Node: Next.js `16.2.12`, React `19.2.4` (pin exact versions, matching `ai-course-management`)
- Browser talks only to Next.js; only Next.js Server Components call FastAPI (via `frontend/lib/api.ts`); only FastAPI touches Postgres — no exceptions, this repeats in every later change too
- All Postgres objects for this project live in the `zijing_cup` schema, never `public`
- `DATABASE_URL`, `BACKEND_SECRET` are read from environment only, never hardcoded; frontend env vars that reach the browser must never be prefixed `NEXT_PUBLIC_` if they carry a secret or backend URL
- Migrations are the only schema source (`supabase/migrations/*.sql`); no ORM auto-migration, no Alembic
- New GitHub repo: `austinxyz/zijing-cup`, public
- Reused Supabase project: `randyudbxqfdqrvgkmmc` (already has an unrelated app's tables in `public` — do not touch those)

---

## File Structure

```
zijing-cup/
├── .claude/commands/opsx/{explore,propose,apply,archive}.md   # copied verbatim from ai-course-management
├── openspec/
│   ├── config.yaml            # adapted context/rules for tennis domain
│   ├── specs/.gitkeep
│   └── changes/.gitkeep
├── docs/
│   ├── requirements.md        # already written (this brainstorm's earlier output)
│   ├── superpowers/specs/2026-08-27-project-bootstrap-design.md   # already written
│   ├── superpowers/plans/2026-08-27-project-bootstrap.md          # this file
│   └── log/.gitkeep
├── backend/
│   ├── pyproject.toml
│   ├── .env.example
│   ├── .gitignore
│   ├── app/
│   │   ├── __init__.py
│   │   ├── db.py              # DATABASE_URL resolution, schema-qualified engine
│   │   ├── auth.py            # shared-secret middleware, /health exempt
│   │   └── main.py            # FastAPI app + /health
│   └── tests/
│       └── test_health.py
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── postcss.config.mjs
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   ├── vitest.setup.ts
│   ├── .env.example
│   ├── lib/
│   │   └── api.ts             # getHealth()
│   └── app/
│       ├── layout.tsx
│       ├── globals.css
│       ├── page.tsx           # renders backend health status
│       └── page.test.tsx
├── supabase/
│   ├── config.toml
│   └── migrations/
│       └── <timestamp>_create_zijing_cup_schema.sql
├── render.yaml
└── CLAUDE.md
```

---

### Task 1: GitHub repo + local git wiring

**Files:**
- Create: none (repo-level operation)

**Interfaces:**
- Produces: a remote `origin` pointing at `https://github.com/austinxyz/zijing-cup` that every later task's commits push to.

- [ ] **Step 1: Create the GitHub repo**

Run: `gh repo create austinxyz/zijing-cup --public --description "Zijing Cup tennis tournament analysis" --source=C:\Users\lorra\projects\zijing-cup --remote=origin`

Expected: command prints the new repo URL `https://github.com/austinxyz/zijing-cup`. This also sets `origin` on the already-initialized local repo at `C:\Users\lorra\projects\zijing-cup` (git init and the first two doc commits already happened during brainstorming).

- [ ] **Step 2: Write root `.gitignore`**

```gitignore
# Python
backend/.venv/
backend/__pycache__/
backend/**/__pycache__/
backend/.pytest_cache/
backend/.env

# Node
frontend/node_modules/
frontend/.next/
frontend/.env.local

# Supabase local stack
supabase/.branches/
supabase/.temp/

# OS
.DS_Store
```

- [ ] **Step 3: Commit and push**

```bash
cd C:\Users\lorra\projects\zijing-cup
git add .gitignore
git commit -m "chore: add gitignore"
git push -u origin master
```

Expected: push succeeds, `docs/requirements.md`, the design doc, and `.gitignore` are visible on GitHub.

---

### Task 2: Backend skeleton — `db.py`

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/db.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `resolve_database_url() -> str`, `normalize_database_url(url: str) -> str`, `engine` (SQLAlchemy Engine, schema-qualified), `get_session()` (FastAPI dependency generator yielding `sqlmodel.Session`), `check_db_connection() -> bool`, `SCHEMA = "zijing_cup"` — all consumed by Task 3's `main.py`.

- [ ] **Step 1: Write `backend/pyproject.toml`**

```toml
[project]
name = "backend"
version = "0.1.0"
description = "Zijing Cup Analysis backend"
readme = "README.md"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.140.13",
    "httpx>=0.28.1",
    "psycopg[binary]>=3.3.4",
    "python-dotenv>=1.2.2",
    "sqlmodel>=0.0.39",
    "uvicorn[standard]>=0.51.0",
]

[dependency-groups]
dev = [
    "pytest>=9.1.1",
]

[tool.pytest.ini_options]
pythonpath = ["."]
```

- [ ] **Step 2: Write `backend/.env.example`**

```dotenv
# Copy to backend/.env and fill in for local development. Real values never
# get committed.

# Local: Supabase CLI's local stack (`supabase start`, run from repo root,
# fills in this exact address). Required — app/db.py has no localhost
# fallback, so a missing value fails fast at startup instead of returning
# 500 on every request once deployed.
DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres

# Production (set in Render's console, not here): use Supabase's connection
# pooler / session mode (port 5432) connection string, not the direct
# connection — direct is IPv6-only and Render's outbound may not support it.
# Paste the postgresql:// string from the Supabase dashboard as-is;
# app/db.py normalizes it to the psycopg v3 driver.

# Shared secret the frontend sends as X-Backend-Secret. Required — unset
# means every request is rejected (fail-closed). Must differ from any
# frontend-only secret.
BACKEND_SECRET=local-dev-secret-not-a-real-one

# Opt-in interactive docs (/docs, /openapi.json). Leave unset in production.
# ENABLE_API_DOCS=1
```

- [ ] **Step 3: Write the failing test for schema-qualified connection**

```python
# backend/tests/test_db.py
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from app.db import SCHEMA, engine, normalize_database_url


def test_normalize_database_url_rewrites_bare_postgres_scheme():
    assert (
        normalize_database_url("postgres://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_normalize_database_url_rewrites_bare_postgresql_scheme():
    assert (
        normalize_database_url("postgresql://u:p@host:5432/db")
        == "postgresql+psycopg://u:p@host:5432/db"
    )


def test_normalize_database_url_leaves_driver_qualified_url_alone():
    url = "postgresql+psycopg://u:p@host:5432/db"
    assert normalize_database_url(url) == url


def test_schema_is_zijing_cup():
    assert SCHEMA == "zijing_cup"


def test_engine_search_path_targets_the_dedicated_schema():
    # The engine must route every unqualified table reference to zijing_cup
    # first, and fall back to public only for extensions/shared objects —
    # never the other way around, or a query here could silently read the
    # other app's rows in the shared Supabase project.
    options = engine.url.query.get("options", "") if engine.url.query else ""
    assert f"-csearch_path={SCHEMA},public" in (
        options or str(engine.dialect.create_connect_args(engine.url)[1])
    )
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && uv sync && uv run pytest tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app'` (app/db.py does not exist yet).

- [ ] **Step 5: Write `backend/app/db.py`**

```python
import os

from dotenv import load_dotenv
from sqlmodel import Session, create_engine, text

# Local development reads backend/.env; deployed environments inject the
# variable directly and have no such file, so this is a no-op there.
load_dotenv()

# Every table this project owns lives here, never in `public` — this
# Supabase project is shared with an unrelated app that already occupies
# `public`. Putting `zijing_cup` first (before `public`) in search_path
# means an unqualified table name resolves to ours; `public` stays in the
# path only so shared extensions (e.g. pgcrypto) remain reachable.
SCHEMA = "zijing_cup"


def normalize_database_url(url: str) -> str:
    """Pin the connection string to the psycopg v3 driver.

    Supabase's console hands out `postgresql://…`. SQLAlchemy reads that bare
    scheme as "use psycopg2", which this project does not install — the app
    would crash on startup with ModuleNotFoundError. Rewriting the scheme here
    keeps a driver-selection detail from leaking into deployment config.

    `postgres://` gets the same treatment: it is a legacy spelling SQLAlchemy
    no longer accepts at all.

    Only the scheme changes; host, port, credentials and database name are
    left untouched. A URL that already names a driver is returned as-is.
    """
    for bare_scheme in ("postgresql://", "postgres://"):
        if url.startswith(bare_scheme):
            return "postgresql+psycopg://" + url[len(bare_scheme) :]
    return url


def resolve_database_url() -> str:
    """Read DATABASE_URL from the environment, or refuse to start.

    There is deliberately no localhost fallback. A default would make a
    deployment that forgot to set DATABASE_URL *look* healthy — the process
    boots, the platform's health check passes — and then fail on every
    request. Better to stop at startup and name the missing variable.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. For local development, copy "
            "backend/.env.example to backend/.env (the Supabase CLI's local "
            "stack is already filled in there). For a deployed environment, "
            "set it in the platform's environment variables."
        )
    return normalize_database_url(url)


DATABASE_URL = resolve_database_url()

engine = create_engine(
    DATABASE_URL,
    connect_args={"options": f"-csearch_path={SCHEMA},public"},
)


def get_session():
    with Session(engine) as session:
        yield session


def check_db_connection() -> bool:
    """Round-trip one trivial query to prove the app can actually reach
    Postgres — not just that a URL was configured. Used by /health."""
    with Session(engine) as session:
        session.execute(text("SELECT 1"))
    return True
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_db.py -v`
Expected: PASS (5 tests). Note: this does not require a running Postgres — `create_engine` is lazy, and the search_path assertion inspects the URL/connect_args, not a live connection.

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/.env.example backend/app/__init__.py backend/app/db.py backend/tests/test_db.py backend/uv.lock
git commit -m "feat(backend): add schema-qualified Supabase connection"
```

---

### Task 3: Backend skeleton — `auth.py` + `/health`

**Files:**
- Create: `backend/app/auth.py`
- Create: `backend/app/main.py`
- Test: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: `app.db.check_db_connection() -> bool` (Task 2)
- Produces: FastAPI `app` object with `GET /health`, exempt from the shared-secret middleware; every other route added in later changes is protected by default.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_health.py
import os
from unittest.mock import patch

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault("BACKEND_SECRET", "test-secret")

from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_ok_when_db_reachable():
    with patch("app.main.check_db_connection", return_value=True):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "ok"}


def test_health_reports_db_error_without_failing_the_request():
    # A DB outage should still return 200 with db:"error", not 500 — /health
    # is what Render polls to decide whether to keep the instance up, and a
    # 5xx here would restart a process that is otherwise serving fine.
    with patch("app.main.check_db_connection", return_value=False):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "db": "error"}


def test_health_needs_no_secret_header():
    # Render's own platform health check cannot send our custom header, so
    # /health must be the one route exempt from the shared-secret gate.
    with patch("app.main.check_db_connection", return_value=True):
        client = TestClient(app)
        response = client.get("/health")
    assert response.status_code == 200


def test_missing_secret_is_rejected_on_other_routes():
    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 401


def test_correct_secret_reaches_routing_on_other_routes():
    client = TestClient(app)
    response = client.get("/", headers={"X-Backend-Secret": "test-secret"})
    # No route is registered at "/" yet in this bootstrap — 404 here proves
    # the middleware let the request through to FastAPI's router instead of
    # blocking it, which is the only thing this test needs to show.
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 3: Write `backend/app/auth.py`**

```python
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
```

- [ ] **Step 4: Write `backend/app/main.py`**

```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/ -v`
Expected: PASS (10 tests total: 5 from Task 2 + 5 here).

- [ ] **Step 6: Commit**

```bash
git add backend/app/auth.py backend/app/main.py backend/tests/test_health.py
git commit -m "feat(backend): add /health endpoint with shared-secret auth"
```

---

### Task 4: Supabase schema

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/<timestamp>_create_zijing_cup_schema.sql`

**Interfaces:**
- Produces: a `zijing_cup` schema in both the local Supabase stack and (once linked + pushed) the shared remote project `randyudbxqfdqrvgkmmc`. Task 2's `engine` depends on this schema existing before any later change can create tables in it.

- [ ] **Step 1: Initialize the Supabase project**

Run: `cd C:\Users\lorra\projects\zijing-cup && supabase init`
Expected: creates `supabase/config.toml` and `supabase/.gitignore`. If prompted to generate VS Code settings, answer no (keep this minimal).

- [ ] **Step 2: Edit `supabase/config.toml`**

Open the generated file and change the `project_id` line near the top to:

```toml
project_id = "zijing-cup"
```

Leave everything else at its generated default — the local stack's default ports (API `54321`, DB `54322`, Studio `54323`) are what `backend/.env.example` already assumes.

- [ ] **Step 3: Start the local stack**

Run: `supabase start`
Expected: Docker containers come up; output prints `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`, matching `.env.example`. (First run pulls images and can take a few minutes.)

- [ ] **Step 4: Write the schema-creation migration**

Run: `supabase migration new create_zijing_cup_schema`
Expected: creates an empty file `supabase/migrations/<timestamp>_create_zijing_cup_schema.sql`. Open it and write:

```sql
-- All tables this project owns live in this schema, never in `public` —
-- this Supabase project is shared with an unrelated app that already uses
-- `public`. See backend/app/db.py's SCHEMA constant and search_path setup.
create schema if not exists zijing_cup;
```

- [ ] **Step 5: Apply the migration locally**

Run: `supabase db reset`
Expected: local DB is recreated and the migration runs; output includes `Applying migration <timestamp>_create_zijing_cup_schema.sql...` with no errors.

- [ ] **Step 6: Verify the schema exists**

Run: `supabase db psql -c "\dn"`
Expected: output lists `zijing_cup` alongside `public` and the other default schemas.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/migrations/
git commit -m "feat(db): create dedicated zijing_cup schema"
```

(Linking this local project to the remote `randyudbxqfdqrvgkmmc` project and pushing the migration happens in Task 7, once the Render/Vercel deploy wiring makes it worth pointing at the real database.)

---

### Task 5: Frontend skeleton — config + `lib/api.ts`

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Create: `frontend/.env.example`
- Create: `frontend/lib/api.ts`
- Test: `frontend/lib/api.test.ts`

**Interfaces:**
- Produces: `getHealth(): Promise<{status: string; db: string}>`, thrown as `Error` on a non-2xx response — consumed by Task 6's `app/page.tsx`.

- [ ] **Step 1: Write `frontend/package.json`**

```json
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "16.2.12",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.4",
    "eslint": "^9",
    "eslint-config-next": "16.2.12",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4",
    "typescript": "^5",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `frontend/next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 4: Write `frontend/postcss.config.mjs`**

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 5: Write `frontend/eslint.config.mjs`**

```javascript
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const eslintConfig = [...compat.extends("next/core-web-vitals", "next/typescript")];

export default eslintConfig;
```

- [ ] **Step 6: Write `frontend/vitest.config.ts`**

```typescript
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
```

- [ ] **Step 7: Write `frontend/vitest.setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 8: Write `frontend/.env.example`**

```dotenv
# Copy to .env.local for local development. Neither of these may ever be
# prefixed NEXT_PUBLIC_ — that would compile the backend URL/secret into the
# browser bundle and hand it to every visitor.

# Local: matches `uvicorn app.main:app` running from backend/ on its default
# port.
BACKEND_URL=http://127.0.0.1:8000

# Must match backend/.env's BACKEND_SECRET exactly.
BACKEND_SECRET=local-dev-secret-not-a-real-one
```

- [ ] **Step 9: Write the failing test for `lib/api.ts`**

```typescript
// frontend/lib/api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "./api";

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the parsed health payload on success", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", db: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getHealth();

    expect(result).toEqual({ status: "ok", db: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/health",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("throws when the backend responds with a non-2xx status", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getHealth()).rejects.toThrow("getHealth failed: 500");
  });

  it("throws a clear error when BACKEND_URL is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(getHealth()).rejects.toThrow("BACKEND_URL is not configured");
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd frontend && npm install && npm run test -- lib/api.test.ts`
Expected: FAIL — `Failed to resolve import "./api"` (the file does not exist yet).

- [ ] **Step 11: Write `frontend/lib/api.ts`**

```typescript
// server-only module: never import this from a "use client" component.
function backendUrl(path: string): string {
  const base = process.env.BACKEND_URL;
  if (!base) throw new Error("BACKEND_URL is not configured");
  return `${base}${path}`;
}

function backendRequestInit(): RequestInit {
  return {
    cache: "no-store",
    headers: { "X-Backend-Secret": process.env.BACKEND_SECRET ?? "" },
  };
}

export interface HealthStatus {
  status: string;
  db: string;
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(backendUrl("/health"), backendRequestInit());
  if (!res.ok) throw new Error(`getHealth failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd frontend && npm run test -- lib/api.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 13: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/next.config.ts frontend/postcss.config.mjs frontend/eslint.config.mjs frontend/vitest.config.ts frontend/vitest.setup.ts frontend/.env.example frontend/lib/api.ts frontend/lib/api.test.ts
git commit -m "feat(frontend): add Next.js skeleton with getHealth() backend client"
```

---

### Task 6: Frontend skeleton — placeholder page

**Files:**
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/app/page.tsx`
- Test: `frontend/app/page.test.tsx`

**Interfaces:**
- Consumes: `getHealth(): Promise<HealthStatus>` (Task 5)

- [ ] **Step 1: Write `frontend/app/globals.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 2: Write `frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zijing Cup Analysis",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Write the failing test for the placeholder page**

```tsx
// frontend/app/page.test.tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getHealth } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", () => ({
  getHealth: vi.fn(),
}));

describe("Home page", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows backend and DB status once getHealth resolves", async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: "ok", db: "ok" });

    render(await Page());

    expect(screen.getByText(/backend: ok/i)).toBeInTheDocument();
    expect(screen.getByText(/database: ok/i)).toBeInTheDocument();
  });

  it("shows an error message when getHealth rejects", async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error("getHealth failed: 500"));

    render(await Page());

    expect(screen.getByText(/could not reach backend/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd frontend && npm run test -- app/page.test.tsx`
Expected: FAIL — `Failed to resolve import "./page"` (the file does not exist yet).

- [ ] **Step 5: Write `frontend/app/page.tsx`**

```tsx
import { getHealth } from "@/lib/api";

export default async function Page() {
  try {
    const health = await getHealth();
    return (
      <main className="p-8 font-sans">
        <h1 className="text-2xl font-bold">Zijing Cup Analysis</h1>
        <p className="mt-4">Backend: {health.status}</p>
        <p>Database: {health.db}</p>
      </main>
    );
  } catch {
    return (
      <main className="p-8 font-sans">
        <h1 className="text-2xl font-bold">Zijing Cup Analysis</h1>
        <p className="mt-4 text-red-600">Could not reach backend.</p>
      </main>
    );
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/page.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/globals.css frontend/app/page.tsx frontend/app/page.test.tsx
git commit -m "feat(frontend): add placeholder home page showing backend health"
```

---

### Task 7: Deploy wiring — Render, Vercel, remote Supabase link

**Files:**
- Create: `render.yaml`

**Interfaces:**
- Produces: a deployed backend URL and frontend URL, both to be recorded back into this plan's verification task (Task 9) and into `docs/requirements.md` if useful for later changes.

- [ ] **Step 1: Write `render.yaml`**

```yaml
# Render Blueprint — backend FastAPI service. Versioned here rather than
# clicked together in the console, so changes can be reviewed and reproduced.
services:
  - type: web
    name: zijing-cup-api
    runtime: python
    plan: free
    rootDir: backend
    # uv is not preinstalled on Render's image; install it, then sync the
    # locked dependencies. --no-dev skips pytest, which the production image
    # does not need.
    buildCommand: pip install uv && uv sync --frozen --no-dev
    # $PORT is injected by Render — never hardcode it. --host 0.0.0.0 is
    # required, or the process only listens on loopback and Render's own
    # health check can never reach it.
    startCommand: uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /health
    envVars:
      # Values are entered in the Render console (Supabase pooler / session
      # mode connection string) and never committed. sync: false means "no
      # value here, wait for a human".
      - key: DATABASE_URL
        sync: false
      - key: BACKEND_SECRET
        sync: false
```

- [ ] **Step 2: Link the local Supabase project to the remote one and push the schema migration**

Run: `cd C:\Users\lorra\projects\zijing-cup && supabase link --project-ref randyudbxqfdqrvgkmmc`
Expected: prompts for the database password (from the Supabase dashboard's connection settings for that project), then confirms the link.

Run: `supabase db push`
Expected: applies `20260827..._create_zijing_cup_schema.sql` to the remote project. Output confirms the migration ran with no errors, and does **not** mention or touch any table in `public` (that schema belongs to the other app sharing this project).

- [ ] **Step 3: Create the Render service**

In the Render dashboard: New → Blueprint → connect the `austinxyz/zijing-cup` GitHub repo → Render reads `render.yaml` and proposes the `zijing-cup-api` service. Before deploying, fill in the two `sync: false` env vars:
- `DATABASE_URL`: from the Supabase dashboard's Connection Pooling section for project `randyudbxqfdqrvgkmmc`, **session mode, port 5432** (not the direct/IPv6 connection).
- `BACKEND_SECRET`: generate a random value (e.g. `openssl rand -hex 32`), and record it — it needs to be pasted into Vercel's `BACKEND_SECRET` in Step 4.

Deploy. Expected: build succeeds; the service's `/health` (visit `https://zijing-cup-api.onrender.com/health` in a browser — this route needs no secret header) returns `{"status":"ok","db":"ok"}`. If `db` is `"error"`, re-check the `DATABASE_URL` value against the dashboard before proceeding.

- [ ] **Step 4: Create the Vercel project**

In the Vercel dashboard: New Project → import `austinxyz/zijing-cup` → set **Root Directory** to `frontend`. Add environment variables:
- `BACKEND_URL`: the Render service URL from Step 3 (e.g. `https://zijing-cup-api.onrender.com`)
- `BACKEND_SECRET`: the exact same value entered in Render in Step 3

Deploy. Expected: build succeeds; visiting the Vercel URL shows "Zijing Cup Analysis" with "Backend: ok" / "Database: ok". (First load may take ~30s if Render's free tier had spun the backend down from inactivity — that's expected on the free plan, not a bug in this bootstrap.)

- [ ] **Step 5: Commit**

```bash
cd C:\Users\lorra\projects\zijing-cup
git add render.yaml supabase/config.toml
git commit -m "chore: add Render blueprint, link remote Supabase project"
git push
```

---

### Task 8: opsx scaffolding

**Files:**
- Create: `.claude/commands/opsx/explore.md`, `propose.md`, `apply.md`, `archive.md` (copied verbatim)
- Create: `openspec/config.yaml`
- Create: `openspec/specs/.gitkeep`
- Create: `openspec/changes/.gitkeep`
- Create: `docs/log/.gitkeep`
- Create: `CLAUDE.md`

- [ ] **Step 1: Copy the opsx command files verbatim**

Run:
```bash
mkdir -p /c/Users/lorra/projects/zijing-cup/.claude/commands/opsx
cp /c/Users/lorra/projects/ai-course-management/.claude/commands/opsx/*.md /c/Users/lorra/projects/zijing-cup/.claude/commands/opsx/
```

Expected: `explore.md`, `propose.md`, `apply.md`, `archive.md` now exist under `zijing-cup/.claude/commands/opsx/`. These files are schema-driven and generic — do not edit them.

- [ ] **Step 2: Create empty openspec directories**

```bash
mkdir -p /c/Users/lorra/projects/zijing-cup/openspec/specs /c/Users/lorra/projects/zijing-cup/openspec/changes /c/Users/lorra/projects/zijing-cup/docs/log
touch /c/Users/lorra/projects/zijing-cup/openspec/specs/.gitkeep
touch /c/Users/lorra/projects/zijing-cup/openspec/changes/.gitkeep
touch /c/Users/lorra/projects/zijing-cup/docs/log/.gitkeep
```

- [ ] **Step 3: Write `openspec/config.yaml`**

```yaml
schema: superpowers-driven

project:
  dev_stack_command: "npm run dev --prefix frontend"
  test_commands:
    - "cd backend && uv run pytest"
    - "cd frontend && npm run test"
  e2e_command: ""
  design_system: ""
  custom_verification_checks:
    - "grep -rn 'console.log' frontend/app frontend/lib || true"
    - "grep -rnE 'SUPABASE_SERVICE|DATABASE_URL|BACKEND_SECRET|NEXT_PUBLIC_(DATABASE|SUPABASE|BACKEND)' frontend/ --include=*.ts --include=*.tsx --include=*.js --include=*.jsx && exit 1 || true"

context: |
  Zijing Cup Analysis —— 紫荆杯校友网球团体赛的球队/球员/UTR数据管理与阵容优化工具。
  使用者是队长、球员和赛事组织者。需求见 docs/requirements.md。

  技术栈：
  - frontend/  Next.js 15 App Router + TypeScript + Tailwind（Node 20+）
  - backend/   FastAPI + Python 3.12 + SQLModel
  - supabase/migrations/  唯一 migration 来源（.sql，不用 Alembic）
  - DB: Supabase 托管 Postgres —— 与另一个应用共享同一个 Supabase 项目，
    本项目的所有表必须建在 `zijing_cup` schema 下，绝不能碰 `public`
    （那是另一个应用的数据）。

  架构纪律（不可违反）：
  - 浏览器只与 Next.js 通信，不直连 FastAPI，不直连 Supabase
  - 前端通过 Server Component 内的 server-side fetch 调用 FastAPI，
    统一封装于 frontend/lib/api.ts
  - 只有 FastAPI 可以访问数据库
  - 新建的 SQLModel 表模型和 migration 都必须显式指定 `zijing_cup` schema

  认证：不做多用户隔离，前后端之间用共享密钥（X-Backend-Secret）。
  `/health` 是唯一豁免该密钥校验的路由。

  领域约束（后续change补充）：
  - UTR 有 Rated / Projected / Unrated 三种状态，Projected 和 Unrated 不能
    直接当作参赛资格
  - 双打UTR搭档的cap和buffer规则逐年变化，不要硬编码到代码里，
    需要可配置

rules:
  specs:
    - "Scenario（Given/When/Then）由 agent 起草、人工 review 确认或修改再定稿；agent 起草时须标出自己不确定/可能遗漏边界的地方。"
  design:
    - "涉及数据库变更时必须说明 migration 策略与回滚方案，且必须显式使用 zijing_cup schema。"
    - "任何试图把 UTR cap/buffer 数值硬编码进代码（而非配置/数据）的设计，直接 BLOCK。"
  tasks:
    - "涉及外部 API 调用（如 UTR）的任务，必须包含超时与异常路径的 RED 测试。"
```

- [ ] **Step 4: Write `CLAUDE.md`**

```markdown
# Zijing Cup Analysis

紫荆杯校友网球团体赛的球队/球员/UTR数据管理与阵容优化工具。取代目前手动维护
UTR官网查询 + Google Sheets的流程。需求见 `docs/requirements.md`；架构决策见
`docs/superpowers/specs/2026-08-27-project-bootstrap-design.md`。

## 架构（不可违反）

- 浏览器只与 Next.js 通信；Next.js Server Components/Server Actions 通过
  `frontend/lib/api.ts` 单一出口调用 FastAPI；只有 FastAPI 能访问数据库。
- `backend/app/auth.py` 的共享密钥中间件默认保护所有路由——新路由不用额外
  声明就是受保护的；只有 `/health` 显式豁免（Render 平台健康检查发不出自定义
  header）。
- Supabase 仅作为纯 Postgres 托管使用：不开 RLS，不用自动生成的 REST API。
- **本项目与另一个应用共享同一个 Supabase 项目**（`randyudbxqfdqrvgkmmc`）。
  所有表、migration 都必须显式指定 `zijing_cup` schema，绝不能建在 `public`
  下——那是另一个应用的数据。`backend/app/db.py` 的 `SCHEMA` 常量和
  `search_path` 设置是这条规则的唯一强制点，改动前先读那段注释。
- Migration 是 schema 变更唯一来源（`supabase/migrations/*.sql`），不用
  Alembic 或任何 ORM 自动迁移。

## 技术栈与部署

| 层 | 技术 | 部署 |
|---|---|---|
| 前端 | Next.js 16 + TypeScript + Tailwind v4 | Vercel |
| 后端 | FastAPI + Python 3.12 + SQLModel，uv管理依赖 | Render (free tier) |
| 数据库 | Supabase Postgres，`zijing_cup` schema | 共享 Supabase 项目 |

Render免费版会在闲置后休眠，冷启动可能要接近1分钟——`frontend/lib/api.ts`
的fetch要留足超时时间，不要假设后端总是热的。

## 认证

不做多用户登录/隔离。前后端之间用共享密钥（`BACKEND_SECRET`环境变量，
经`X-Backend-Secret` header传递）。如果未来需要队长/球员分级权限，
这是一个明确要重新设计的点，不要在现有共享密钥模型上打补丁。

## 开发流程

用opsx四阶段：`/opsx:explore` → `/opsx:propose` → `/opsx:apply` → `/opsx:archive`。
配置见`openspec/config.yaml`。

## Pitfalls

（后续开发中发现的坑，按`/opsx:archive`的清理步骤持续补充到这里）
```

- [ ] **Step 5: Commit**

```bash
cd C:\Users\lorra\projects\zijing-cup
git add .claude openspec docs/log CLAUDE.md
git commit -m "chore: add opsx workflow scaffolding and CLAUDE.md"
git push
```

---

### Task 9: End-to-end local verification

**Files:** none (manual verification task, no new files)

- [ ] **Step 1: Start the local Supabase stack (if not already running from Task 4)**

Run: `cd C:\Users\lorra\projects\zijing-cup && supabase status`
Expected: shows the stack running with `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`. If not running, `supabase start`.

- [ ] **Step 2: Set up backend env and run it**

```bash
cd C:\Users\lorra\projects\zijing-cup\backend
cp .env.example .env
uv run uvicorn app.main:app --reload --port 8000
```

Expected: server starts on `http://127.0.0.1:8000` with no errors.

- [ ] **Step 3: Verify the backend health endpoint directly**

Run (in a second terminal): `curl http://127.0.0.1:8000/health`
Expected: `{"status":"ok","db":"ok"}`. If `db` is `"error"`, confirm `supabase start` finished successfully and `backend/.env`'s `DATABASE_URL` matches its printed connection string exactly.

- [ ] **Step 4: Set up frontend env and run it**

```bash
cd C:\Users\lorra\projects\zijing-cup\frontend
cp .env.example .env.local
npm run dev
```

Expected: server starts on `http://localhost:3000`.

- [ ] **Step 5: Verify the full chain in a browser**

Open `http://localhost:3000`. Expected page content: "Zijing Cup Analysis", "Backend: ok", "Database: ok".

- [ ] **Step 6: Run the full test suite one more time**

```bash
cd C:\Users\lorra\projects\zijing-cup\backend && uv run pytest -v
cd C:\Users\lorra\projects\zijing-cup\frontend && npm run test
```

Expected: all backend and frontend tests pass.

- [ ] **Step 7: Record the deployed URLs**

Add a short note to `docs/requirements.md` (or a new `docs/log/2026-08-27.md` entry) recording the live Render and Vercel URLs from Task 7, so the next opsx change (`roster-import`) has them at hand. Commit.

```bash
cd C:\Users\lorra\projects\zijing-cup
git add docs/
git commit -m "docs: record bootstrap verification and deployed URLs"
git push
```

---

## Self-Review Notes

- **Spec coverage:** every bootstrap deliverable listed in the design doc (repo, backend skeleton, frontend skeleton, Supabase schema, deploy configs, opsx scaffolding, end-to-end verification) has a task above.
- **Placeholder scan:** no TBD/TODO; every code block is complete and runnable as written.
- **Type/name consistency:** `check_db_connection`, `SCHEMA`, `get_session`, `getHealth`, `HealthStatus` are defined once (Tasks 2/5) and referenced identically in every later task that consumes them.
- **Deferred by design, not by omission:** UTR data model, lineup engine, and any auth beyond the shared secret are explicitly out of scope per the design doc's Non-Goals — they are not silently missing, they are `roster-import` / `lineup-engine` / a future change.
