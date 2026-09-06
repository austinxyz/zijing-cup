---
Date: 2026-09-05
Change: player-admin-workbench
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# player-admin-workbench — 队员管理页：查看/编辑模式 + 双栏搜索工作台

当前队员管理页（`/[season]/[division]/players`）是单栏列表 + 独立详情路由
（`/players/[id]`），且**整个板块被 `canEdit` gate**——非编辑者进不去。要改成与队伍页/阵容页
一致的**查看/查看编辑双模式**（任人可读、编辑才 gate），并重排为**左右两栏工作台**：左边多
字段搜索 + 结果列表，点某人右边就地显示其详情；编辑模式下可改队员。

## Goals

1. **查看/编辑模式，任人可读、编辑 gate。** 页头加「编辑模式 / 查看模式」开关（复用
   `EditModeToggle` 就地解锁那套，带 season/division）。**去掉 `players/layout.tsx` 的 `canEdit`
   重定向**——任何人可进只读工作台（队员数据本就在名单页公开）；编辑权按 `canEdit(season,
   division)` 判，与队伍页一致。查看模式下**隐藏所有写动作**（改字段/裁决/合并/拆分入口全隐），
   详情、UTR 来源、未裁决徽标仍只读可见。

2. **左右两栏布局。** 左栏 = 搜索条件 + 结果列表；右栏 = 选中队员详情。左栏在选择间保持不动
   （搜索/滚动位置不丢），右栏随选择更新。桌面并排，移动端上下堆叠（详情态可返回列表）。

3. **左栏多字段搜索。** 字段：**姓名**（现有 `q`，ilike 姓/名）、**性别**（下拉：全部/男/女）、
   **所在队伍**（模糊，ilike `Team.code` + `Team.display_name` 中文名）、**参赛年份**（下拉；
   命中规则：该年有参赛 UTR `season_utrs.season_year` **或** 该年在某队名单 `membership.season_year`，
   两者任一）。多条件 **AND** 组合。显式点「搜索」触发（GET 表单，不逐键打后端），条件写进 URL 可分享。

4. **左栏结果列表精简。** 每行只显示：**姓名**、**性别**、**最新参赛 UTR**（`season_utrs[0]`，
   已按年降序；若筛了年份则显示该年的值）、**所在队伍**（memberships 的队伍，简显）。点行选中该队员。
   列表在自带滚动容器内（`h-screen overflow-hidden` 壳下必须，否则静默裁切无滚动条）。

5. **右栏详情就地更新。** 选中经 URL `?sel=<player_id>` 软导航；右栏渲染该队员详情（复用现有
   `/players/[id]` 详情内容：资料/性别/UTR 链接、各赛季参赛 UTR + 来源 + 未裁决横幅、所在队伍
   只读表）。未选时右栏空态提示「从左边选一个队员」。

6. **编辑模式下的写动作。** 编辑模式解锁后，右栏详情可：**改队员字段**、**裁决**参赛 UTR、
   **合并**、**拆分**。这些沿用现有后端端点与不可逆确认。**不含队伍加/移出**（见 Non-Goals）。

7. **后端 `list_players` 加筛选参数。** 新增 `gender`（精确）、`team`（模糊，ilike code + display_name）、
   `year`（任一：有该年 `PlayerSeasonUtr` 或该年 `Team` membership）。保留现有 `q`/`season`/`team_id`/
   `unresolved`。计数端点 `count_players` 同步支持新参数（列表上限 200，徽标/截断计数走真实总数，
   不数当前页）。

## Non-Goals

- **队伍页加/移出队员**：`add_membership`/`remove_membership` 后端已就绪、无前端接线；归**另一个
  change**（team-roster-ui），不在本 change。本 change 的右栏详情**不做**队伍加/移出（memberships
  只读显示）。
- 不改队员数据模型、不加新表、不动后端鉴权（仍共享密钥 + 按方法判权）。
- 不做实时 UTR 同步、不改参赛 UTR 的冻结/覆盖语义。
- 不改未裁决队列本身的逻辑（`/players/unresolved`）；只在查看模式隐其写入口、编辑模式照常。

## Constraints

- **架构不可违反**：浏览器只连 Next；取数经 `lib/api.ts`、写经 `lib/admin.ts`（唯一写出口，按比赛
  scope 判权）；只有后端连库；表都在 `zijing_cup` schema。
- **查看模式必须真只读**：与「编辑才 gate」一致——查看模式绝不出现任何写控件（避免「隐不可逆动作
  但留字段编辑」的自相矛盾）。
- **来源/未裁决的既有诚实约束保留**：参赛 UTR 两候选按**记录来源**布列（不按大小）、未裁决同档警示、
  「无参赛 UTR」不写 0、缺失字段用松判显示（`== null`）。
- **软导航回填坑**：`?sel=` 软导航复用 DOM，非受控输入/详情面板需按选中 id `key` remount，否则显示
  陈旧值。
- **可空三态**（外援 None/False/True）只读显示时 None=未标、False=确认非、True=确认是，别拍平。
- 移动端与桌面每块都要有对应版式（mocks 阶段定）。

## Success Criteria

- 未登录/未解锁该比赛的人能打开队员管理页、搜索、看任意队员详情（只读），看不到任何写控件。
- 解锁该比赛后出现编辑模式开关；编辑模式下可改字段/裁决/合并/拆分；查看模式下这些全隐。
- 左栏四类条件（姓名/性别/队伍模糊/参赛年份）单用与组合都能正确筛选；队伍模糊能用中文名搜到；
  年份按「参赛UTR年 或 名单年」任一命中；条件在 URL 里、可分享、刷新保持。
- 结果列表每行显示 姓名/性别/最新参赛UTR/所在队伍；点行右栏就地出该人详情（URL 带 `?sel=`）。
- 后端 `list_players`/`count_players` 新参数有单测；截断/未裁决计数仍走真实总数。
- 真实数据实测：按性别、按中文队名模糊、按某年分别搜出预期集合；选中一人右栏详情正确。

## User Stories

- 作为负责人（super）或某组队长（该组已解锁），我想在一个页面里按姓名/性别/队伍/年份快速找到某个
  队员，点开就在右边看他的完整信息，需要时就地改。
- 作为任何人（未登录），我想查规则、名单、阵容之外也能只读地查队员是谁、在哪几支队、UTR 多少，
  但改不了任何东西。
- 作为队长，我想用中文队名而不是英文 code 搜到某支队的人。

## Open Questions

已定默认（design/mocks 可微调，但不再是需求级歧义）：

- **合并/拆分**：保留现有独立子路由（`/players/[id]/merge`、`/split`），从右栏详情的入口进入；不改成
  右栏内抽屉。（子路由带完整确认页，就地抽屉放不下不可逆操作的对照。）
- **结果列表「所在队伍」多队显示**：显示**最新一支** + 「+N」计数；hover/详情看全部。（mocks 定样式。）
- **参赛年份下拉可选值**：来自 seasons 列表（与侧栏赛季切换器同源）。
- **搜索 vs 选中**：搜索是 GET 全导航（条件进 URL），**一次新搜索清空 `?sel=` 选中**（结果集变了，旧
  选中未必还在）；选中是 `?sel=` 软导航、不重跑搜索。

apply 阶段需核对（非需求歧义，是落地时的数据事实）：

- `Player.gender` 的实际值域（`M`/`F`/null 还是中文），据此定性别下拉的提交值与显示。

## Referenced Capabilities

- **player-admin-ui**（本 change 主要改这个：页面布局、搜索、查看/编辑模式、详情右栏）。
- **admin-access / admin-credentials**（复用 `canEdit(season,division)` + `EditModeToggle` 就地解锁 +
  `adminWrite` 按比赛 scope 判权；查看/编辑 gate 完全沿用 scoped-admin-auth 的机制）。
- **team-roster / team-roster-ui**（队伍 code + `display_name` 供队伍模糊搜索；队伍加/移出队员是
  这个能力的**后续 change**，本 change 只引用不实现）。
- **player-registry**（`players` / `player_season_utrs` / `player_team_memberships` 数据；`list_players`
  查询扩展）。
