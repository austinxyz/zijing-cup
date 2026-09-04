### Contract
- **Spec**: (team-roster) `get_team_roster` 的每名队员 SHALL 带出 `wins`/`losses`（生涯战绩，
  来自 players）。两者可空，MUST NOT 用 0 或哨兵冒充「未知」。胜率是显示派生量，后端不算、
  不带出——只带 `wins`/`losses` 两个整数。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_roster_api.py -q` → expected:
  花名册响应含 wins/losses；有战绩带整数、未导入带 null，全绿。
- **Code**: D4 —— `RosterPlayerOut` + `get_team_roster` 加 `Optional[int]` 两字段；后端不算胜率。
- **Threshold**: 80
