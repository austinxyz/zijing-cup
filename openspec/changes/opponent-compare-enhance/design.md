## Context

`/[season]/[division]/compare` 已能选两侧「队+已存阵容」逐线并排（`page.tsx` server 组件
取数、`CompareControls` client picker、`compareBuild.ts` 纯函数、`canEdit` 机密门、状态在 URL）。
本 change 在其上加：选阵容即见上场人员、保存对比、每线备注。参照既有范式——
`lineup-filter-presets`（命名存取 + 同名覆盖 + 只读降级）、`lineup-saved-lineups`/`CollapsibleSaved`
（折叠卡就地展开）、`player-notes`（机密门 + adminWrite + revalidate）。

## Goals / Non-Goals

**Goals:**
- 复用现有 saved lineup `assignment` + `getTeamLineups().roster` 解析，不新增聚合端点做特性1。
- 一张新表 `saved_comparisons` 承载「引用 + 每线备注」，读写走既有单一出口与方法判权中间件。
- 展开卡就地实时重算，与既有逐线对比同一套 `compareBuild`。

**Non-Goals:**
- 不改 saved_lineups / roster / 规则模型；不做快照、不做胜负预测、不做备注历史。
- 即席对比不做备注。

## Decisions

- **D1 每线备注存法 = 同表 JSONB `line_notes {line_code: text}`。** 单条可改、无历史，
  JSONB map 最省，和 `lineup_filter_presets.constraints` 同范式；避免第二张表 + join。
  空串按删除该 key 处理。备选（独立 `compare_line_notes` 表）被否：多一张表和一层 join，收益为零。
- **D2 lineup 引用用普通 `int`（不加 on-delete-cascade 外键），载入时对现存 saved lineup
  `find` 解析。** 满足「阵容删了保留对比、展开标『阵容已删』」（用户拍板）。saved_lineups.id 是
  identity 不复用，悬空 int 安全。备选 FK SET NULL 会丢 id（无法显示是哪套）；FK cascade 会连对比
  一起删——与需求相反。team code 同样存字符串（与现有 URL 参数一致）。
- **D3 存引用不存快照，展开实时重算。** 阵容改了对比跟着变（用户要引用语义）。展开态复用
  `compareBuild(lineOrder, sideA, sideB)`，与现有即席对比同一函数；两侧各按 `lineup_a_id` 找当前
  saved lineup + 取该队 roster 解析。
- **D4 折叠卡就地展开，不写 URL、不动 picker。** 仿 `CollapsibleSaved`：卡自己管展开态（client
  局部 state 即可，不进 URL——展开是查看动作不是可分享条件）。picker 仍用 URL（`?a=&al=&b=&bl=`）
  维持即席搭配可分享。两者互不干扰。
- **D5 特性1 纯前端。** 选完一侧即预览：server 组件已在取两侧 saved lineups + roster，把「选中
  阵容的 assignment 按线序解析成 5 线名单」交给一个纯函数/子组件渲染（仿 LineBlock 呈现）；下拉
  签名由同一 assignment 取首线搭档拼一小段。无新端点。
- **D6 数量上限每 `(season, division)` ≤ 50**（仿 saved_lineups / presets），超限保存 409。
- **D7 写端点挂在 compare 相关 router，方法判权自动保护**（POST 建、PATCH 改名/改备注、DELETE 删）；
  读一个只读列出端点（backend secret）。前端 `getSavedComparisons` 非 ok/异常降级 `[]`。

## Risks / Trade-offs

- [悬空 lineup int 指向已删阵容] → 载入 `find` 不到即标「阵容已删」、不渲染该侧（D2 有意为之）。
- [远程共享 Supabase 新表未建时后端读会 500] → 读路径降级为空（表未建 = 无对比），前端 error.tsx
  + `getSavedComparisons` 降级；**push 读新表的后端前先去 Dashboard 手工建表**（no-CLI-push）。
- [展开态多套卡各自实时重算，取数变重] → 列出端点只回引用（轻）；展开某卡时才解析该套（两侧 roster
  已在 server 取过一次可复用）；若卡多再考虑懒加载，本期不预优化。
- [line_notes JSONB 无 schema 校验] → 后端写端点限 key ∈ 规则线序、value trim + 长度上限。

## Migration Plan

1. 写 migration `supabase/migrations/<ts>_create_saved_comparisons.sql`（`set search_path
   to zijing_cup, public;` 打头，schema-qualified，`unique(season_year, division_code, name)`，
   `line_notes jsonb not null default '{}'`，时间戳 server_default）。
2. 本地打到本地栈（断言 `127.0.0.1`）跑测试。
3. 远程：**push 读新表的后端前**，去 Supabase Dashboard SQL Editor 手工执行该 migration。
4. 前端/后端读路径对缺表降级，故部署顺序容错；但正式生效以远程建表为准。
5. 回滚：`drop table zijing_cup.saved_comparisons;`（无其它表引用它）。

## Open Questions

（无——D1–D7 已把 explore 阶段三个待定项定死：备注 JSONB 同表、引用用普通 int、上限 50。）
