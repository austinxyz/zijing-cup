#!/usr/bin/env bash
# Restore the local development database.
#
# The test fixtures TRUNCATE the rule and roster tables on teardown, so every
# `pytest` run leaves the local stack empty and the next page load returns
# 404s that look like a broken route rather than an empty database. This puts
# the three seeds back, in the order they depend on each other: rules create
# the divisions, rosters create the teams, names attach to those teams.
#
# Local only: refuses to run unless DATABASE_URL points at localhost.
set -euo pipefail
cd "$(dirname "$0")/.."

uv run python - <<'PY'
from app.db import engine

url = str(engine.url)
assert "127.0.0.1" in url or "localhost" in url, (
    f"refusing to reseed a non-local database: {engine.url.render_as_string(hide_password=True)}"
)
PY

uv run python -m app.seeds.load_rules
uv run python -m app.rosters 2025 gold data/rosters/2025-gold.csv > /dev/null
uv run python -m app.rosters 2025 silver data/rosters/2025-silver.csv > /dev/null
uv run python -m app.seeds.team_names
echo "local database restored"
