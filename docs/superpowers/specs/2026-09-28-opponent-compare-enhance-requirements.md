---
Date: 2026-09-28
Change: opponent-compare-enhance
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# opponent-compare-enhance — 对手对比加强

现有 `/[season]/[division]/compare` 已能选「我方队+已存阵容 / 对手队+已存阵容」逐线并排（只摆 UTR
事实、不判胜负，`canEdit` 机密门）。本 change 加三件事：

1. **选阵容时看到上场人员** —— 阵容下拉的每个选项带上场签名；选完某侧后，在该侧下方列出这套阵容的
   5 线 10 人（姓名+性别+参赛 UTR），不必等两侧都选好。（纯前端）
2. **保存对比** —— 把当前「我方队+阵容 / 对手队+阵容」这组选择连同一个名字存下来，之后在 /compare
   顶部一键载入、删除。存**引用**（四个 id）不存快照：载入时按引用**实时重算**对比（阵容变了对比跟着变）。
3. **每条线加备注** —— 已保存的对比里，每条线一格**单条可改**的备注（如「D1 我方稳，盯 MD」），随该
   已存对比持久。

## Goals

1. **特性1 · 上场人员可见（纯前端，无新表）。**
   - 阵容下拉选项文案除名字外带**上场签名**（如首线搭档或人数），选之前就能分辨几套阵容。
   - 选完某侧（队+阵容）后，在该侧 picker 下方渲染这套阵容的**逐线名单**：5 线、每线两人，
     姓名 + 性别符号（♂/♀）+ 该人参赛 UTR，仿 `LineBlock` 呈现。不必等两侧都选。
   - 数据来自已有 `getSavedLineups`（`assignment`）+ `getTeamLineups().roster`（`key→player`），
     与逐线对比表同一套解析，不新增后端。
2. **特性2 · 保存 / 展开-折叠 / 删除对比。**
   - 新表 `zijing_cup.saved_comparisons`：`season_year`、`division_code`、`name`、
     `team_a_code`、`lineup_a_id`、`team_b_code`、`lineup_b_id`、`line_notes` JSONB、时间戳。
     `name` 在 `(season, division)` 内唯一，同名覆盖（仿 `lineup_filter_presets` / `saved_lineups`）。
   - 存的是**引用**（team code + saved_lineup id），不是快照。
   - /compare 顶部新增「已存对比」区：列出本赛季/组别的已存对比，每条是一张**可展开/折叠的卡**
     （仿阵容页 `CollapsibleSaved`）——折叠只显示名字 + 两侧队/阵容名；**展开就地渲染这套的逐线对比
     （按引用实时重算）+ 每线备注**，不跳转、不写 URL、不动上方 picker。每卡可删除。
   - 顶部 picker 仅用于**新建**：两侧都选好后「保存当前对比」起名存下（同名覆盖），存完出现为一张
     折叠卡。（picker 与逐线预览是即席区，供搭配与保存；已存对比的查看走展开卡。）
3. **特性3 · 每线备注（单条可改，挂已存对比）。**
   - `saved_comparisons.line_notes` JSONB = `{ line_code: text }`，每条线至多一条、可覆盖可清空。
   - 在某张已存对比**展开态**里，逐线对比每行多一格「本线备注」：管理员可就地编辑（写回该对比的
     `line_notes`）；非编辑态只读显示。
   - 备注**只属于已存对比**：即席区（picker 预览）不提供每线备注（要先保存成卡）。
4. **写入端点（后端）。** 新增受保护写路由建/改/删 `saved_comparisons` 与更新 `line_notes`
   （靠 `WRITE_METHODS` 中间件自动保护，不加前缀/依赖式鉴权）。读端点按赛季/组别列出。

## Non-Goals

- 不改已存阵容（`saved_lineups`）/ roster / 规则的数据模型。
- 不判胜负、不预测比分（沿用现状，只摆 UTR 事实 + 本线人工备注）。
- 每线备注**不做**追加式时间线/多条历史——单条可改即可（与队员评价/阵容评论的 append 形态不同，
  这是有意为之）。
- 不做即席（未保存）对比的每线备注。
- 不加实时 UTR 同步；载入实时重算指的是按当前 saved_lineup 状态重算，不联网取 UTR。

## Constraints

- **机密门沿用 `canEdit(season, division)`**：已存对比引用已存阵容（管理员机密），整页与保存/备注写
  都在 canEdit 之后；未解锁就地锁定态、不发取机密数据请求（现状如此，不回退）。
- 架构不可违反：读经 `lib/api.ts` 单一出口，写经 `lib/admin.ts` 的 `adminWrite`（scope `{season,
  division}`）+ 成功 `revalidatePath`；只有 FastAPI 访问库。
- 新表在 `zijing_cup` schema；migration 以 `set search_path to zijing_cup, public;` 打头或全限定名；
  远程共享 Supabase 走 Dashboard 手工执行（no-CLI-push），**push 读新表的后端前先建表**。
- 只读旁支取数失败**降级为空不崩页**（`getSavedComparisons` 非 ok/异常 → `[]`）；表未建时
  /compare 顶部「已存对比」为空、页面照常。
- 阵容被删（某侧 `lineup_a_id`/`lineup_b_id` 指向的 saved_lineup 不在了）：**保留该已存对比**，载入时
  该侧标「阵容已删」、不渲染该侧线格与差距；不 cascade 删对比。（故 lineup id 不用 on-delete-cascade
  外键——存普通 int 或 FK SET NULL，载入 `find` 不到即标记；design 定死。）
- 选择/载入状态进 URL（`?a=&al=&b=&bl=`，与现状一致）可分享；载入即改这四个参数。
- 状态徽标/颜色对比度机测（≥4.5:1，量 computed style）；每线备注格与新面板显式给 `bg-surface`。

## Success Criteria

- 选完某侧队+阵容，**不必等另一侧**，该侧下方即列出这套 5 线 10 人（姓名+性别+参赛 UTR）；阵容下拉
  选项带签名可分辨。
- 两侧都选好后，管理员可「保存当前对比」并起名（同名覆盖、空名/超长拒、队内唯一）；/compare 顶部
  「已存对比」列出为可展开/折叠的卡、可删除。
- 展开某张已存对比卡：就地渲染逐线对比（实时重算）+ 每行可编辑「本线备注」，保存后持久；折叠再展开
  仍在；清空可行。不跳转、不动上方 picker。
- 某侧引用的阵容被删：该已存对比卡仍在，展开时该侧标「阵容已删」、不渲染该侧，不崩页。
- 读端点失败 / 表未建 → 顶部「已存对比」为空，页面其余照常（不 500）。
- 非编辑者（未解锁）进不去 /compare（就地锁定态）；保存/备注写无管理员凭据被拒。
- 真实数据实测：同组两队各存阵容 → 选中看名单 → 保存对比 → 载入 → 每线写备注 → 删一侧阵容后载入标
  「阵容已删」。

## User Stories

- 作为队长（已解锁），我选一支队和它的一套已存阵容，想**马上看到这套谁上场、排哪条线**，不必先把
  对手也选好。
- 作为队长，我摆好一组「我方阵容 vs 对手阵容」的对比，想**存下来起个名**（如「打 THU 预案」），下次
  直接载入，不用重选。
- 作为队长，载入某套对比后，我想**逐线记一句**（「D2 对手弱，主攻」「WD 我方险」），随这套对比留着，
  排阵/临场时回看。

## Open Questions

- 阵容下拉「签名」放多少信息（首线两人？总和？人数）——design 阶段按下拉可读性定；侧栏名单给全。
- `saved_comparisons` 每队/每组别的数量上限（仿 saved_lineups 的 ≤50？）——design 定。
- lineup 引用用「普通 int + 载入解析」还是「FK SET NULL」——design 定（都能满足「保留+标已删」）。

## Referenced Capabilities

- `opponent-compare`（本 change 扩展它：/compare 页、逐线并排、canEdit 门、URL 状态）。
- `lineup-saved-lineups`（引用其 saved_lineup + `assignment`/`roster` 解析；被引用阵容删除的降级）。
- `lineup-filter-presets`（命名存取 + 同名覆盖 + 队内唯一 + 只读降级 的既有范式，本 change 仿它）。
- `app-shell` / `scoped-admin-auth`（canEdit 门、adminWrite scope、error.tsx 范式）。
