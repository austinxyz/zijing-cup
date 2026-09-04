# Contract — Group 1

- **Spec**: 规则按 division 存（如 `division_borrowed_limits(division_id, school_count, roster_cap, on_court_cap)`）并随 seed 灌入，可逐赛季/组别改数据而不改代码。`teams` SHALL 带一个可空的 `school_count`；`null` 表示未设。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "borrowed or school_count or rules"` → expected: 规则/学校数模型与 seed 测试通过，无 import 错误
- **Code**: D1 新 migration（`teams.school_count int null` + 表 `division_borrowed_limits`，`unique(division_id, school_count)`；文件以 `set search_path to zijing_cup, public;` 开头）；seed 2026 金+银 `(1,3,2)(2,2,1)(3,0,0)(4,0,0)`；本地打 127.0.0.1（断言连接串含 127.0.0.1），远程 Dashboard 手工、禁 CLI push。
- **Threshold**: 80
