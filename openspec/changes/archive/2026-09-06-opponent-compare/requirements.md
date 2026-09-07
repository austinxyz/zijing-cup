---
Date: 2026-09-06
Change: opponent-compare
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# opponent-compare — 对手对比（逐线并排）

侧栏有个 disabled 的「对手对比」占位。要做成一个分区级页面：选**我方一支队 + 它的一套已存阵容**、
**对手一支队 + 它的一套已存阵容**（同赛季/组别），把两套阵容**逐线并排**，帮排阵前判断。你不知道
对手当场会上什么，所以对手那套也是你**给对手队提前存好的**某套阵容——把它当作对手的一种可能。

## Goals

1. **分区级 `/compare` 页 + 点亮侧栏。** 新页 `/[season]/[division]/compare`；`nav.ts` 的「对手对比」
   从 `pending:true` 改为可点、指向该页。
2. **两个「队 + 已存阵容」选择器。** 左（我方）与右（对手）各选一支本赛季/组别的队 + 它的一套已存
   阵容。两队对等，无强制主客。某队没有已存阵容时该侧提示为空。
3. **逐线并排（只摆事实）。** 按线位（D1/D2/D3/MD/WD）逐行：我方两人（姓名 + 性别 + 该线 UTR 和）
   ｜ 对手两人（同上）｜ **差距 = 我方线和 − 对手线和**。底部一行：两队**总 UTR 和** + 差。
   **不判胜负、不预测比分。**
4. **姓名/性别经 roster 解析。** 已存阵容只存 `assignment`（线→球员 key）+ `line_totals`（线→当前
   UTR 和）+ `total`，不带姓名。逐队取 `getTeamRoster` 建 `key→RosterPlayer` 映射解析姓名/性别，
   与已存阵容页同法。
5. **陈旧/非法阵容要标出。** 用**当前** `line_totals`/`total` 比。若某套已存阵容当前 `status` 是
   `utr_moved` / `illegal` / `player_gone`，该侧 SHALL 明确标注（别把陈旧或非法阵容当有效来比）；
   `player_gone` 无法算总和时不硬凑。

## Non-Goals

- **名单实力对比**（两队按 UTR 深度并排）——后续 change，本次不做。
- **胜负预测 / 总比分预测**——不做（避免把 UTR 差的猜测当确定）。
- **引擎实时解对手最优阵容**——不做；对手阵容只来自已存阵容。
- 不改已存阵容/roster 的数据模型；不加实时 UTR 同步。

## Constraints

- **权限：已存阵容是管理员机密**（见 lineup-saved-lineups / scoped-admin-auth——saved lineups 只对
  `canEdit` 显示）。`/compare` 展示两队的已存阵容，故 SHALL 按 `canEdit(season, division)` gate：
  未解锁本比赛者进不去（重定向到解锁入口或队伍页），**无游客查看模式**。
- 架构不可违反：取数经 `lib/api.ts`（`getDivisionTeams`/`getSavedLineups`/`getTeamRoster`），写无
  （本页只读）；浏览器只连 Next。
- 尽量**不加后端端点**：前端组装两侧（各 team 的 saved lineups + roster）。若组装过重再考虑一个
  只读聚合端点（design 阶段定）。
- 线位顺序用规则里的线序（`getDivisionRules` 的 `lines`），不写死；两队同线对齐。
- 选择器状态进 URL（`?a=<teamCode>&al=<lineupId>&b=...&bl=...`）可分享、刷新保持（与全站「状态在
  URL」一致）。

## Success Criteria

- 解锁本比赛后，侧栏「对手对比」可点 → `/compare`；未解锁进不去。
- 选我方队+阵容、对手队+阵容后，逐线并排显示：每线两对（姓名+性别+线 UTR 和）+ 差距；底部两队总和+差。
- 姓名/性别正确解析（经各队 roster）；线位按规则线序对齐。
- 某侧阵容当前 `utr_moved`/`illegal`/`player_gone` 时有明确标注；`player_gone` 不显示假的总和。
- 选择器条件在 URL、可分享/刷新保持；某队无已存阵容时该侧空态提示而非报错。
- 真实数据实测：给同组两支队各存一套阵容，`/compare` 选中后逐线并排正确、差距算对。

## User Stories

- 作为某组队长/负责人（已解锁该组），我想把我准备的一套阵容和我预判对手会上的一套（我提前给对手队存
  好的）逐线摆一起，看每条线我领先还是落后多少，据此调整我的排布。

## Open Questions

已定（无悬空歧义；mocks/design 可微调样式）：
- **UTR 用当前重算和**（`line_totals`/`total` 已是当前），`utr_moved` 标出。不用存档快照。
- **同队可两侧都选**（自己比自己）——允许、不特意禁止，无害。
- 差距正负色（领先绿/落后红或中性）留给 mocks，不影响需求。

## Referenced Capabilities

- **opponent-compare**（新能力：/compare 页、逐线并排、两侧选择器）。
- **app-shell**（`nav.ts` 点亮「对手对比」侧栏项）。
- **lineup-saved-lineups**（复用已存阵容数据 `getSavedLineups`、`assignment`/`line_totals`/`status`；
  机密性约束沿用）。
- **team-roster**（`getTeamRoster` 解析球员 key→姓名/性别；`getDivisionTeams` 列队）。
- **admin-access / admin-credentials**（`canEdit(season,division)` gate，与已存阵容一致）。
