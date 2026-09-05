### Contract
- **Spec**: (admin-credentials) 系统 SHALL 有一张 `admin_credentials` 表（`season_year`、
  `division_code`、`password_hash`、`updated_at`，`(season_year, division_code)` 唯一），后端只存/回
  字符串、MUST NOT 算或校验密码。系统 SHALL 提供 GET 读该比赛 hash（无行 404，需 `X-Backend-Secret`）
  与 PUT upsert（写方法，另需 `X-Admin-Secret`，按方法判权自动覆盖）。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_admin_credentials.py backend/tests/test_admin_auth.py -q` → expected:
  表/唯一约束、GET 读/404、PUT upsert、无 X-Backend-Secret→401、无 X-Admin-Secret→403，全绿。
- **Code**: D5 —— `AdminCredential` 模型（表 `admin_credentials`、唯一 (season,division)、
  `password_hash text`、`updated_at` server_default）；GET/PUT 路由；`auth.py` **不动**（中间件已覆盖）；
  migration `set search_path to zijing_cup` 开头、无 FK（密码行可先于 division）、本地打 127.0.0.1。
  后端绝不算 hash。
- **Threshold**: 80
