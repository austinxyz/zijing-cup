## Context

组委会导出的 current-utr CSV 已带 `总场次,胜,负,胜率`四列（在既有八列 `id,姓,名,当前单打,
单打状态,当前双打,双打状态,UTR链接` 之后），但系统没读。队伍页想显示队员胜负战绩。

现有导入管线（`backend/app/players/utr_sheet.py`）：`parse_sheet` → `SheetRow`（按位置读
cell(0..7)）→ `diff_sheet` 产 `DiffResult`（`PlayerChange.fields` + 每字段 `counts` 供整列
错位排查）→ 全有或全无 apply（`routers/utr.py::apply_sheet` 对每个 `FieldChange`
`setattr(person, field, _typed(...))`）。字段集中在 `FIELDS`（5 个）与 `_changed_fields`
（显式 pairs）。数值字段用 `_same_value`/`_as_decimal` 按数比较（避免 `7` vs `7.00` 假差异）。
比较后端有一条硬地基（`current-utr-io` spec）：**本系统自己导出的表原样导回 SHALL 产生 0 处
改动**。

## Goals / Non-Goals

**Goals:**
- `players.wins`/`losses`（可空 int，生涯值），migration 建列。
- 导入按位置多读 `胜`(cell 9)/`负`(cell 10)，进 diff（可预览、计数防错位）、随全有或全无落库。
- 花名册响应带 `wins`/`losses`；前端类型收进 `RosterPlayer`。
- 队伍页只读花名册加胜率列（`胜-负` + `%`，缺失 `—`）。

**Non-Goals:**
- 编辑模式手改胜负（导入唯一入口）；逐场明细；按赛季快照。
- 改既有导入字段语义；阵容引擎用胜率。
- **导出侧不动**：`COLUMNS`（导出列）保持 8 列，不加胜/负——见下方决策。

## Decisions

### D1 — 存 players（生涯值），不存总场次/胜率
胜率 = `胜/(胜+负)`、总场次 = `胜+负`，都是派生量。存派生量会引入不一致来源（CSV 的 `77%`
与算出的可能不符）。只存两个整数，胜率在**前端**显示时算。`wins`/`losses` 可空：`null`=从未
导入，`0`=真的 0（0 是合法战绩，不能拿来冒充未知）。
- *备选*：存 `total_matches` + `win_rate` —— 弃，派生量入库=第二真相源。

### D2 — 导出保持 8 列，导入容忍并读取尾部胜/负列
往返 0 改动的地基是关于**本系统导出的表**：我们导出 8 列 → 导回时没有胜/负单元格 →
`_changed_fields` 里 `written==""` 跳过 → 战绩 0 改动，地基不动。组委会那份 12 列表导入时，
`_row_from_cells` 读 cell(9)/cell(10) 写进 `SheetRow.wins/losses`。`总场次`(8)/`胜率`(11)
不读。
- *备选*：导出也加胜/负 —— 弃，扩大改动面且非本次需求（无人从本系统导出后再核对战绩往返）；
  真要往返对称是后续独立 change。这条决策的代价写进 Risks。

### D3 — 胜/负进 `FIELDS` 与 `_changed_fields`，复用全套 diff/apply/计数
加进 `FIELDS`（`counts` 自动含它俩，整列错位一样能看出）与 `_changed_fields` 的显式 pairs
（`("wins", row.wins, person.wins)`、`losses` 同）。整数按 `str(existing)==written` 判等
（int 的 `str()` 无小数尾巴问题，不必进 `_NUMERIC_FIELDS`）。空=不动、`-`=清空，沿用既有语义。
`_typed` 加 int 分支：wins/losses → `int(value)`。apply 的 `setattr` 循环天然覆盖。
- 校验：新增 `_winloss_errors`——非空非 `-` 的胜/负必须是**非负整数**，否则报行级错误（与
  `_numeric_errors` 一样，坏值整批回滚，不静默coerce）。

### D4 — 花名册响应加两字段，前端类型收成可空 number
`RosterPlayerOut` + `get_team_roster` 带 `wins`/`losses`（`Optional[int]`）。`lib/api.ts` 的
`RosterPlayer` 加 `wins: number | null`、`losses: number | null`——后端漂移直接红 tsc。

### D5 — 胜率显示派生 + 三种空态
前端 helper：`wins`/`losses` 任一 null → `—`；`wins+losses==0` → `0-0` 且百分比 `—`（不除零）；
否则 `胜-负` + `round(wins/(wins+losses)*100)%`。桌面表新增列、手机卡片新增行。撑不下走既有横滚。

## Risks / Trade-offs

- [导出不含胜/负，从本系统导出再导入会「看不到」战绩列] → 可接受：战绩在库里没丢，只是导出表不
  回显；真实用法是导入组委会表。若将来要导出对称，另开 change。
- [整列错位把胜/负写乱] → `counts` 已含两列，预览能看出异常高的改动数；全有或全无回滚。
- [远程 migration 手工执行前新列不存在] → 部署顺序：先 Dashboard 执行 migration，再上后端；
  只读增强失败降级的规则对 apply 不适用（apply 是写路径，列不存在会 500，但那是迁移未跑的既知代价）。

## Migration Plan

1. 写 `supabase/migrations/*_player_win_loss.sql`：`set search_path to zijing_cup, public;` +
   `alter table players add column wins int; add column losses int;`（可空、无默认）。
2. 本地：断言连接串含 `127.0.0.1` 后直接把 SQL 打到本地栈（本机跑不了 CLI）。
3. 远程：**Dashboard SQL Editor 手工执行**（禁 CLI push/repair，共享项目）。**先迁移，后上后端。**
4. 回滚：`alter table players drop column wins, drop column losses;`（无数据依赖，安全）。

## Open Questions

（无——存储、导入、显示、导出不动均已定。）
