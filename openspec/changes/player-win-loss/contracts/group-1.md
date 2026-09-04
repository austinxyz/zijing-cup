### Contract
- **Spec**: (player-registry) 队员 SHALL 带一对可空的整数 `wins` / `losses`（生涯战绩，
  跨赛季，最新一次导入为准）。两者皆可空：`null` 表示从未导入过战绩，与 `0`（真的 0 胜或
  0 负）是不同的断言，MUST NOT 用 0 表示未知。总场次与胜率 MUST NOT 入库。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_players_model.py -q` → expected:
  模型/migration 相关测试通过；`wins`/`losses` 默认 None、可存整数、DB 列可空。
- **Code**: D1 —— 只存两整数、不存派生量；可空且默认 null（不用 server_default，None=NULL
  正是意图，与时间戳那条 NOT NULL 陷阱相反）。migration 以 `set search_path to zijing_cup,
  public;` 开头；本地打 127.0.0.1、远程 Dashboard 手工执行、禁 CLI push。
- **Threshold**: 80
