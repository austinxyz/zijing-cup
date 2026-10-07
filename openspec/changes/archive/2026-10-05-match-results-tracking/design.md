## Context

团体赛打完的对局目前无处记录。本 change 新增比赛记录 capability，让管理员录入已打完的比赛并在排阵时
参考。沿用项目现有纪律：读经 `lib/api.ts` 单一出口、写经 `lib/admin.ts` `adminWrite`、只有 FastAPI 访库、
新表在 `zijing_cup` schema、远程共享 Supabase 的 migration 走 Dashboard 手工执行（no-CLI-push）。

现状可复用的件：`saved_lineups.assignment` 的 `{line: [player keys]}` JSONB 范式；`saved_comparison`
的「存引用、`lineup_a_id` 是无 FK 的 int」范式；compare 页「key→player 经 roster 解析」的显示范式；
`divisions` 的 `scoring_mode`（`match_count` / `points`）与 `division_lines`（线序 + points）。

## Goals / Non-Goals

**Goals:**
- 一张比赛记录表，录入/读取/历史列表/对手维度全部走现有读写出口与 canEdit 门。
- 我方阵容独立快照、可从已存阵容预填、可空溯源，且溯源目标消失不影响历史。
- 对手逐线球员引用名单、对不上留空。
- 整场胜负按 `scoring_mode` 从逐线结果推导，单一真相。

**Non-Goals:**
- 球员赢率聚合、比分结构化、免密公开、回喂引擎、外部抓取（见 proposal Out of Scope）。

## Decisions

### D1 — 单表 + JSONB 存逐线结果（不开子表）

一张 `zijing_cup.match_records`，逐线结果存一个 JSONB 列 `lines`：

```
lines = {
  "D1": { "our": ["p123","p456"], "opp": [789, null], "outcome": "win", "note": "抢七险胜" },
  "MD": { "our": ["p234","p567"], "opp": [790, 791],  "outcome": "loss", "note": "" },
  ...
}
```

- `our`：我方 roster key（与 `saved_lineups.assignment` 同一套 key，预填时直接搬）。
- `opp`：对手 player **id**（int），对不上的位置为 `null`。
- `outcome`：`"win"` / `"loss"`。
- `note`：自由文本（可空字符串）。

**为什么 JSONB 不开子表**：线位是每组固定的小集合（≤5），比赛记录永远整条读（历史列表、详情、对手区
都要整场），从不按单线查询或聚合单线。子表会为「永远整读」付出 join 代价，且 `saved_lineups` 已用 JSONB
存同形状数据，一致。**代价**：JSONB 无 schema 约束 → 写入侧必须用 pydantic 模型逐线校验
（`outcome` 枚举、`our` 两个 key、`note` 长度），不能裸塞。

**备选（否决）**：`match_line_results` 子表（每线一行）。更范式但对「永远整读」是过度规范化。

### D2 — 整场胜负纯推导，不落库

整场结果 SHALL 在**读时**由后端从 `division_lines`（线序 + points）+ `lines[*].outcome` + division
`scoring_mode` 计算，不存任何 `our_score`/`result` 列。

- `match_count`（银）：数 `outcome=="win"` 的线数 vs 线数，整场 3–2 之类。
- `points`（金）：赢的线按其 `division_lines.points` 加权求和，对比对手得分。
- 未录满的线不计入（部分录入也能显示当前比分，不假装满场）。

**为什么不缓存列**：CLAUDE.md「不要两处真相」——逐线是唯一真相，缓存列会和逐线漂移；scoring_mode
规则逐年可调，推导保证改规则即时生效。**代价**：每次读多一步计算，但量极小（≤5 线）。

### D3 — 我方/对手只存引用，显示在读时解析（无 UTR 快照）

`our` 存 roster key、`opp` 存 player id，**不存** 姓名/性别/UTR 快照。显示时经各队当季 roster 的
`key→player` / `id→player` 解析（与 compare 页同一套），批量取 player 避免 N+1。

**为什么不存 UTR 快照**：比赛记录的核心是「谁上场 + 输赢」，不是阵容合法性校验（saved_lineup 需要
UTR 快照是为合法性）。姓名/性别从 player 现取即可；参赛 UTR 不是比赛记录的必要字段。**代价**：若某
球员日后被移出名单，其位解析不到 → 按「未记录」降级显示（与对手留空同一处理），可接受。

### D4 — `source_lineup_id` 可空 int、无 FK

溯源列 `source_lineup_id`（nullable int，**无外键约束**，照 `saved_comparison.lineup_a_id` 范式）。
saved_lineup 删除/改名不触碰比赛记录，快照自存。

**为什么无 FK**：FK + ON DELETE SET NULL 也能达成，但项目既有「存引用的 int 不加 FK」先例
（saved_comparison），保持一致、少一个跨表约束。

### D5 — 日期用 DATE、用户录入

`match_date` 存 `date`（非 timestamp），由管理员录入。tz pitfall 针对的是**服务端自动取当天**
（采样快照那条），本场日期是用户手填，直接存 DATE、不涉及服务器时钟，无 tz 风险。

### D6 — 缺表降级

`lib/api.ts` 的 `getMatchRecords` 等读函数非 ok/异常 → 返回 `[]`（照 `getSavedComparisons`/
`getTeamPresets` 范式）。远程表未建时历史页、对手区、录入页都按「无历史」渲染，不 500。

## Risks / Trade-offs

- [JSONB 无约束，脏数据] → 写入侧 pydantic 逐线校验（outcome 枚举 / our 恰两 key / note 长度 / opp
  为 int|null）；读侧对缺字段容错。
- [对手/我方球员解析 N+1] → 一场内所有引用的 player 一次批量取。
- [整场部分录入时算分歧义] → 只统计已录线，显示「当前 X–Y」，不补零假装满场。
- [对手队校验漏判跨组] → 写入侧断言对手 team 属于同 (season, division)，DB 侧 team_id 外键保证存在。
- [远程表未建就 push 后端] → 读路径已降级；写端点在建表前会 500（录入功能到建表才可用，核心页不受影响）。

## Migration Plan

1. 写 `supabase/migrations/<ts>_create_match_records.sql`（`set search_path to zijing_cup, public;` 打头、
   schema-qualified、`match_date date not null`、`lines jsonb not null default '{}'`、`source_lineup_id int`
   可空无 FK、`our_team_id`/`opponent_team_id` → `zijing_cup.teams` FK、`created_at/updated_at` server_default、
   composite FK `(season_year, division_code)` → divisions，校验对手≠我方）。
2. 本地：按 CLAUDE.md 直接把该 SQL 打到本地栈（断言连接串含 `127.0.0.1`），本机 supabase CLI 跑不了。
3. 远程：backend 读新表的代码 **push 前**，去 Supabase Dashboard SQL Editor 手工执行该 migration
   （no-CLI-push）。建表前读路径降级为空、写端点 500。
4. 回滚：删表（本地）；远程删表 SQL 手工执行。无数据迁移依赖。

## Open Questions

- 无剩余阻塞问题。布局细节（录入表单一行 vs 分块、历史区折叠默认态、侧栏入口位置）已在 mock 定稿，
  apply 的 VISUAL DIFF 对齐即可。
