---
Date: 2026-09-04
Change: team-roster-editing
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-04-team-roster-editing-requirements.md
---

## Why

队长现在只能读队伍页——改队员 UTR、标外援、填代表学校都得等组委会新总表。同时「每场外援
上场上限」是真实赛制规则，但系统从没校验过（`borrowed_players_checked` 恒 false）。这个
change 把队伍页变成可就地编辑（复用阵容页那套口令解锁），并让外援上场限制真正进引擎——规则
按赛事数据化，明年能改数据不改代码。

## What Changes

- **队伍页就地编辑模式**：`teams/[code]` 顶部加「编辑模式」开关，就地输 admin 口令解锁（复用
  `unlockAdmin` / 登录 action，不跳 `/login`），密码错/限速同款反馈；只读用户看不到编辑控件。
- **批量改双打 UTR，一次 Save**：花名册表格的「当前双打」列在编辑态变可输入，改多人后一个
  「保存」提交。沿用既有「未锁季写双打 UTR 顺带覆盖该赛季参赛 UTR」语义与赛季锁护栏。
- **外援 / 外卡 / 代表学校 / 学校数编辑**：勾选 `is_borrowed_player`、`is_wildcard`；本校队员
  选 `representing_school`（勾了外援**或**外卡的行学校控件禁用——外部球员无本校可代表）；队伍
  新增 `school_count`（几所学校组成的联队）。
- **外援上场限制进引擎**（`lineup-search`）：新增按 division 的外援上限规则（数据化、seed 灌），
  搜索校验**上场十人**外援数 ≤ `on_court_cap(school_count)`；因外援超限无解时用新原因类型
  `borrowed_over_limit` 点名外援 + 超出量；`borrowed_players_checked` 真正落地。
- **候选 / 已存阵容标出外援**（`lineup-ui`）：三行块里外援队员用可辨的颜色/标记区分。
- **名单总外援校验**：编辑保存时若名单外援数 > `roster_cap(school_count)`，**警告放行**（提示，
  不硬拦）。

## Capabilities

### New Capabilities

（无——全部是对既有能力的修改 + 两处新 schema。）

### Modified Capabilities

- `team-roster-ui` — 队伍页编辑模式（就地解锁）、批量双打 UTR、外援/外卡/代表学校（条件）与
  学校数编辑控件、名单外援超限警告、外援在花名册的标记。
- `player-registry` — 写入语义：批量双打 UTR（含未锁季覆盖参赛值的护栏）、membership 的
  `is_borrowed_player`/`is_wildcard`/`representing_school` 写入、`teams.school_count` 写入。
- `lineup-search` — 外援上场上限规则（新 `division_borrowed_limits` 表 + seed）、上场十人外援数
  校验、`borrowed_over_limit` 无解原因、`borrowed_players_checked` 落地。
- `lineup-ui` — 候选/已存阵容三行块外援配色标记。

## Impact

- **Schema / migration**：`teams.school_count`（int，可空）；新表 `division_borrowed_limits
  (division_id, school_count, roster_cap, on_court_cap)`。seed 灌 2026 金+银：
  `(1,3,2)(2,2,1)(3,0,0)(4,0,0)`。migration 是唯一来源；远程走 Dashboard 手工执行、本地打
  127.0.0.1（禁 CLI push）。
- **后端**：`app/models`（Team.school_count；新规则模型）；`app/players/command.py`（批量双打
  UTR、membership 写、school_count 写）；新写路由（受方法判权中间件保护）；`app/lineups/
  search.py` + `rules.py` + `query.py`（外援规则加载、上场校验、`borrowed_over_limit` 归因、
  `borrowed_players_checked=true`）；`seeds` 加外援上限。
- **前端**：`teams/[code]/`（`EditModeToggle` 复用、`RosterTable`/`RosterEditor` 扩批量双打
  UTR + 外援/外卡/学校列 + 学校数、保存/警告）；`lib/api.ts`（roster 加 school_count/borrowed
  暴露、写 action、`LineupSearch` 的 `borrowed_over_limit`/per-player borrowed 标记收 union）；
  `lineup/[code]/`（`LineBlock`/`CandidateCards`/`SavedLineups` 外援配色）。

## Out of Scope

- 实时 UTR 同步（参赛 UTR 仍赛前冻结）。
- 外卡进搜索约束（模型注释：不影响资格）。
- 高 UTR 上限（`division_eligibility_limits`）与引擎其它四关不动。
- 多用户分级权限（沿用共享密钥 + 就地解锁单管理员模型）。
- 从 `representing_school` 自动推 `school_count`（学校数人工填）。
