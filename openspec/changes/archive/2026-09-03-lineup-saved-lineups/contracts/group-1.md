### Contract
- **Spec**: 系统 SHALL 按 (赛季,组别,队) 存命名阵容 + 线位分配 + 参赛 UTR 快照；快照 MUST NOT 回写参赛 UTR、MUST NOT 影响引擎取数；同队名唯一、同名覆盖。存/删/存回 SHALL 是写操作、MUST 由方法判权 admin 中间件保护，列出+重判 SHALL 只读开放。列出时 SHALL 对每套用**当前** UTR 跑 `check_lineup` 给四态（仍合法 / UTR 动了仍合法 / 已非法带 violations / 有人离队），并给逐人快照 vs 当前差异；有人离队 MUST NOT 判为合法。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_saved_lineups.py tests/test_admin_auth.py` （本机 uv 被拦用系统 venv；CI 用 `uv run pytest`）→ expected: 存/取/删/同名覆盖、快照不回写、重判四态、无凭据写被拒 全通过
- **Code**: D1 单表 `zijing_cup.saved_lineups`（`assignment` + `utr_snapshot` 两列 JSONB、`unique(team_id,name)`、时间戳 server_default、FK cascade）；同名 upsert。D2 重判在列表 GET 逐套：`load_roster` 当前 key→Candidate 解析 assignment，任一 key 缺→`player_gone` 不跑 check；否则组 lineup 跑 `check_lineup`，`is_legal` + 快照 diff 分「仍合法/动了仍合法」、否则 `illegal`+violations。D5 存/删/存回 POST/DELETE/PUT 自动受保护，name≤60、每队≤50。远程迁移走 Dashboard，本地打本地栈（断言 127.0.0.1）。
- **Threshold**: 80
