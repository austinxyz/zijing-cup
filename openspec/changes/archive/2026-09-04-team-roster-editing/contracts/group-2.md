# Contract — Group 2

- **Spec**: 后端 SHALL 提供写入 membership 的 `is_borrowed_player`/`is_wildcard`/`representing_school`（按 (队员,队伍)，与五字段端点分开，方法判权保护）。`teams.school_count` 可由管理员写入。未锁季写当前双打 UTR SHALL 一并覆盖该赛季参赛 UTR（批量对每人应用同一规则）；已锁季只写当前值。无管理员凭据 SHALL 返回 403。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "membership or school_count or utr or auth"` → expected: 写入/覆盖/锁季/鉴权测试通过
- **Code**: D3 新 server 写路由（中间件自动保护）：(a) membership 三字段（与五字段端点分开，后端兜底 borrowed/wildcard 为真时 representing_school 应空）；(b) school_count 写；(c) 批量当前双打 UTR，逐条套 saveCurrentUtr 的「未锁季覆盖参赛值」。Decimal 全程。
- **Threshold**: 80
