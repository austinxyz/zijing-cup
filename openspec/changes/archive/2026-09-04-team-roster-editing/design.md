## Context

`PlayerTeamMembership` 已带 `is_borrowed_player` / `is_wildcard` / `representing_school` 三列
（今天没有写它们的 UI）。`PlayerSeasonUtr.value` 是参赛 UTR；`saveCurrentUtr` 单条写当前
单/双打，未锁季一并覆盖参赛值（`RosterEditor` 已实现，含赛季锁警告）。花名册页 `teams/[code]`
的 `RosterTable` 有列 性别/参赛/来源/当前单打/当前双打，`RosterEditor` 提供逐条就地编辑；
`player-registry` 有「按 id 批量写五字段」的写端点（当前 UTR）。阵容引擎 `search.py`/`query.py`
的 `borrowed_players_checked` 恒 false，从不校验外援；高 UTR 限制 `division_eligibility_limits`
是一套可参照的「按 division 存规则 + 引擎强制」范例。阵容页刚做的 `EditModeToggle` + `unlockAdmin`
就地解锁可复用。三行块 `LineBlock` 是候选/已存阵容共用呈现。

## Goals / Non-Goals

**Goals:** 队伍页就地编辑（解锁 / 批量双打 UTR / 外援·外卡·学校·学校数）；外援上场上限进引擎，
数据化按 division；候选/已存阵容标外援。

**Non-Goals:** 实时 UTR 同步；外卡进搜索；改高 UTR 限制；多用户权限；从 representing_school 推
school_count。

## Decisions

**D1 Schema（migration，唯一来源）。** 新 migration：`alter table zijing_cup.teams add column
school_count int null;` + 新表 `division_borrowed_limits(id, division_id fk, school_count int,
roster_cap int, on_court_cap int, unique(division_id, school_count))`。文件以 `set search_path
to zijing_cup, public;` 开头。seed 灌 2026 金+银：`(1,3,2)(2,2,1)(3,0,0)(4,0,0)`。本地打
127.0.0.1（断言连接串含 127.0.0.1）；远程去 Dashboard 手工执行（禁 CLI push/repair）。

**D2 引擎外援校验。** `RuleSet` 加载时读该 division 的 `division_borrowed_limits` → dict
`school_count -> (roster_cap, on_court_cap)`。团队搜索入参带 `school_count`（从 team 读）。
`check_lineup` 或候选过滤阶段：统计上场十人里 `is_borrowed_player` 为真的数（外援标记随
`Candidate` 带出，需在 `load_roster` 把 membership 的 borrowed 读进 `Candidate`），> on_court_cap
则该套非法。`school_count` 为 null → 跳过校验、`borrowed_players_checked=false`（与旧行为一致），
否则 true。无解归因 `diagnose_line`/`infeasibility` 加原因类型 `borrowed_over_limit`，点名超限
外援（用 `_display_name` 格式化，避免 tab 拼接）。`is_wildcard` 不参与。

**D3 写端点。** 新 server actions + FastAPI 写路由（方法判权中间件自动保护）：
(a) membership 写：`(player_id, team_id, {is_borrowed_player?, is_wildcard?, representing_school?})`
——与「五字段」端点分开。(b) `teams.school_count` 写。(c) 批量当前双打 UTR：复用/扩现有批量写
路径，逐条套用「未锁季覆盖参赛值」（`saveCurrentUtr` 的逻辑抽成可批量调用）。校验 representing_school
在 borrowed/wildcard 为真时应为空（后端也兜一层，不只靠前端禁用）。

**D4 队伍页编辑 UI。** `teams/[code]` 头部挂 `EditModeToggle`（复用，传 `signedIn=canEdit`）。
`RosterTable`/`RosterEditor` 编辑态：当前双打列变批量输入（改动高亮 + 单一保存条，走 D3c）；
新增 外援/外卡 勾选列、代表学校下拉（borrowed/wildcard 勾上则 disabled）、队伍 `school_count`
输入（头部，显示据此的名单/上场上限）。名单外援数 > roster_cap → 保存条转警告仍可存。只读态
不渲染任何控件（沿用「未登录不出编辑入口」）。roster 取数扩 `school_count` 与 per-player borrowed。

**D5 外援配色。** `LineBlock` 的 seat 加 `borrowed?: boolean`；外援 seat 用新 token（底色条
`--color-borrowed-surface` + 角标或名字色），量 computed style ≥4.5:1，进 `globals.contrast.test.ts`；
不与 ♂/♀、估算标记撞。`CandidateCards` 与 `SavedLineups` 的 seat 构造把后端 borrowed 传进去。
`lib/api.ts` 的候选/已存阵容 per-player 加 `is_borrowed_player`，`borrowed_over_limit` 收进
infeasibility reason 的 literal union（后端漂移红 tsc）。

## Risks / Trade-offs

- [本机 supabase CLI 被拦 + 本次 session 本地栈时有无响应] → migration 本地直接打 SQL（断言
  127.0.0.1），远程 Dashboard 手工；本地栈不通就先只做能测的单元层，视觉核对推迟。
- [未锁季批量双打 UTR 会无声覆盖组委会冻结的参赛值] → 沿用既有护栏（赛季锁）+ 界面就近说明；
  批量放大了影响面，保存前提示覆盖范围。
- [borrowed 标记要一路从 membership 带到候选/已存阵容 seat] → 在 `load_roster` 一处读进
  `Candidate`，候选与已存阵容都经它，避免两条路径不一致（「两个端点互相矛盾」那类坑）。
- [roster_cap 只警告不拦] → 编辑中间态常暂时超限；硬约束在引擎（上场 cap）那关。

## Migration Plan

1 个 migration（`teams.school_count` + `division_borrowed_limits`）+ seed。本地打 127.0.0.1；
远程 Dashboard 手工执行。回滚 = 还原前端/后端提交 + drop 新列/表（远程手工）。部署：Vercel 前端 +
Render 后端随 push。

## Open Questions

（外援配色具体 token 在 apply 的 VISUAL DIFF 里量定；其余评审已定：名单超限警告放行、
`borrowed_over_limit` 原因、逐行规则表、代表学校条件编辑。）
