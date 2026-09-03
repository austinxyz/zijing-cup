## Context

合法性由 `rules.py` 的 `check_lineup(rules, lineup) -> LegalityReport`（`lineup = {线:(CandA,CandB)}`，
`violations: Violation[code, line, amount, message]`，`is_legal` 属性）判定，算的是参赛 UTR。
`query.py` 的 `load_ruleset(session,year,code)` 出 `RuleSet`、`load_roster(session,year,code,team)`
出当前 `Candidate` 列表（key→当前 `match_utr`）。`teams` 表 `unique(season_year,division_code,code)`。
写路由样板见 B（`lineup_filter_presets`）：`lib/admin.ts` server action、方法判权中间件、JSONB 列、
迁移。前端无法自己判合法性（规则在后端）。

## Goals / Non-Goals

**Goals:** 存一套阵容 + UTR 快照；服务端用当前 UTR 重判四态；就地编辑（互换/替换）实时判；存回/载入/删。

**Non-Goals:** 不改引擎/规则/候选呈现/pin/preset；不自动修；不回写参赛 UTR；per-user/历史版本/跨队。

## Decisions

### D1 — 单表，两列 JSONB（分配 + 快照分明）

新表 `zijing_cup.saved_lineups`：

```sql
set search_path to zijing_cup, public;
create table saved_lineups (
    id          bigint generated always as identity primary key,
    team_id     bigint not null references teams (id) on delete cascade,
    name        text   not null check (char_length(name) between 1 and 60),
    -- 线位分配：{"D1":["p12","p34"], ...}
    assignment  jsonb  not null,
    -- 保存时每人参赛 UTR 快照：{"p12":"6.98", ...}。只读留存，绝不回写。
    utr_snapshot jsonb not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (team_id, name)
);
create index saved_lineups_team_idx on saved_lineups (team_id);
```

两列而非合并：分配是「谁在哪条线」、快照是「当时多少」，语义不同、读法不同（分配进重判/载入，
快照只做 diff）。同名覆盖用 upsert（`on conflict (team_id,name) do update`）。SQLModel 时间戳用
`sa_column=Column(..., server_default=func.now(), nullable=False)`（NOT NULL+DB 默认，别写 `=None`）。

### D2 — 重判在列表 GET，逐套跑 check_lineup（当前 UTR）

`GET /.../teams/{team}/saved-lineups` 对每套：用 `load_roster` 的当前 key→Candidate 解析 `assignment`
的 10 个 key。任一 key 解析不到 → 状态 `player_gone`（点名缺谁），不跑 check。全解析到 → 组
`lineup={线:(A,B)}` 跑 `check_lineup`：`is_legal` → 看快照与当前是否有差异分「仍合法」/「UTR 动了
仍合法」；非法 → `illegal` + violations。响应逐套带 `status`、`violations`、`utr_diff`（`{key:{name,
snapshot, current}}` 仅列变了的）。check_lineup 是纯函数、快（非搜索），N 套逐个跑无压力。

### D3 — 校验端点 POST，编辑器防抖

`POST /.../teams/{team}/saved-lineups/validate`，body `{assignment:{线:[a,b]}}` → `{violations:[...]}`：
`load_roster` 当前值解析 key（未知→422、旧格式→stale-link，走既有 `_reject_old_keys`）后 `check_lineup`。
POST 被方法判权自动要求 admin——编辑本就是 admin 动作，一致。前端编辑器每次改一次请求，客户端**防抖
~300ms**并标「校验中」，避免冷启动实例被连点打爆。重复上场（同 key 两处）由 `check_lineup` 的
`_check_distinct` 据实报，不预拦。

### D4 — 路由与编辑交互

新路由 `frontend/app/[season]/[division]/lineup/[code]/saved/`（`page.tsx` + `error.tsx`）：列出四态卡片，
每套内联编辑（不开子路由）。编辑：五线十槽，**替换**=每槽一个下拉（整队名单）；**互换**=选中两个槽
高亮、点「互换选中的两人」对调。改动后调校验端点、就近显示 live 合法/卡哪条。存回=PUT 覆盖 + 重拍快照。
候选行的「保存此阵容」入口加在结果区（`LineupResults`/`CandidateTable`/`CandidateRow`），admin 才见，
走 server action POST。

### D5 — 归属、鉴权、上限

存(POST)/存回(PUT)/删(DELETE) 自动受 `WRITE_METHODS` 保护；列表(GET)开放；校验(POST)要 admin。
**不**加前缀判权、**不**用依赖式鉴权；`test_admin_auth.py` 全应用断言覆盖新写路由。name ≤60、每队
saved lineup ≤50。载入=把 assignment 编码成五线硬锁 `lock=LINE:a,b` 写进排阵 URL（复用 B/pin 的载入），
坏 key 走 stale。

## Risks / Trade-offs

- [快照被误当合法性依据] 快照只做 diff 展示，合法性**永远**按当前 UTR 的 check_lineup → 前端断言状态
  来自后端重判，不拿快照算。
- [编辑器请求风暴] 每改一次一请求，冷启动慢 → 客户端防抖 + 「校验中」态；校验是纯函数端点、无搜索，
  服务端便宜。
- [assignment 里 key 冲突/坏] 走既有 URL 同款校验（未知 4xx、旧格式 stale），冲突交 check_lineup 报。
- [SQLModel NOT NULL + server_default 发 NULL] 时间戳用 `sa_column server_default`，别 `Optional=None`。

## Migration Plan

新增一张表，无破坏性。本地打本地栈（断言 127.0.0.1）；远程 Dashboard 手动执行。回滚 = `drop table
saved_lineups`。后端先部署（表+端点），前端随后。前端有降级：列表取数失败不拖垮排阵页（同 B）。

## Open Questions

（探索阶段 5 条已解决：D1 两列 JSONB、D3 校验端点+防抖、D4 路由+编辑交互、D5 上限。无遗留。）
