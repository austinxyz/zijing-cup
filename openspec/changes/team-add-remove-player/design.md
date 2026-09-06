## Context

队伍页 `app/[season]/[division]/teams/[code]/` 用 `TeamEditPanel`（client）在编辑模式下改已有队员的
旗标/学校/校数，经 `teams/[code]/actions.ts` 的 server action `saveTeamEdits` 批量 PATCH。后端
`add_membership`（POST `/players/{id}/memberships` {team_id,...}）、`remove_membership`（DELETE
`/players/{id}/memberships/{membership_id}`）、`create_player`（POST `/players`）均已就绪，含赛季锁
（409）、重复（409）、词表校验。`adminWrite`（lib/admin）是唯一写出口，按比赛 scope 判权。

## Goals / Non-Goals

**Goals:** 队伍页编辑模式加/移出队员（搜现有或建新人加入；行内确认移出），接到既有后端端点。

**Non-Goals:** 不改后端、无 migration；不做批量；不在队员工作台加/移出；加入表单不含学校/外援/外卡。

## Decisions

### D1 — 三个 server action（teams/[code]/actions.ts）
- `addExistingPlayerToTeam(season, division, teamId, playerId)` → `adminWrite("POST",
  "/api/players/{playerId}/memberships", { team_id: teamId }, {season,division})`。
- `createAndAddPlayer(season, division, teamId, {last_name, first_name, gender})` → 先
  `adminWrite("POST", "/api/players", {last_name, first_name, gender: gender||null})` 取回新 id，再
  `addExistingPlayerToTeam`。gender "" → null（词表校验只接受 M/F/null）。
- `removePlayerFromTeam(season, division, teamId, playerId)` → 见 D2。
- 三者均 `revalidatePath` 队伍页。错误：让 `adminWrite` 抛出的后端 detail 冒泡，client 就地显示。

### D2 — 移出解析 membership_id（前端，不改后端）
`RosterPlayer` 不带 membership_id。`removePlayerFromTeam` 先 `getPlayer(playerId)`，在其
`memberships` 里找 `team_id === teamId` 的那条取 `id`，再 `adminWrite("DELETE",
"/api/players/{playerId}/memberships/{membershipId}", undefined, {season,division})`。add_membership
保证每队每人至多一条，故按 team 定位唯一；找不到（已被移走）→ 抛清晰错误，不静默。
- *备选*：给 roster 响应加 membership_id（后端改）。否——保持本 change 前端-only，与「后端已就绪」一致。

### D3 — team_id 来源
`add_membership` 要数字 `team_id`。队伍页目前按 `code` 取数（`getTeamRoster(season,division,code)`）。
apply 时确认 `TeamRoster` 响应是否带队伍数字 id：带则直接用；不带则 `saveTeamEdits` 一侧已有的
team 标识复用，或用 `getDivisionTeams(season,division)` 按 code 解析出 id（一次读，缓存在页面）。
这是 apply 的落地细节，不是需求歧义。

### D4 — 搜索接线
`TeamEditPanel` 是 client，`getPlayers` 是 server。加一个 server action `searchPlayersForAdd(query)`
返回精简结果（id/last/first/gender），client 用 useTransition 调它渲染下拉结果。不逐键打——输完点
「搜索」触发（与队员工作台一致）。搜索跨赛季/组别（一个人可能在别赛季存在）。

### D5 — 控件门与既有编辑门一致
加/移出只在 `TeamEditPanel` 已渲染（即 `canEdit` 且编辑模式）时出现——沿用现有面板的显隐，不新增
门。查看模式/未解锁根本不渲染该面板的编辑区。

## Risks / Trade-offs

- [移出解析多一次 `getPlayer` 往返] → 可接受（单次操作，非热路径）；按 team_id 定位唯一，不会误删。
- [create_player 的 gender 词表校验] → gender 只提交 M/F/""；"" 映射为 null，避免 422。
- [空 representing_school 传 ""] → 加入不传该字段（null），避免与「批量双打 UTR 空串 422」同类问题。
- [并发：加入后名单未刷新] → 每个 action `revalidatePath`；client 成功后依赖 RSC 重渲染，不手动拼本地态
  （避免陈旧）。

## Migration Plan

无 migration、无后端改动、无新表。纯前端接线，Vercel 部署即可；回滚 = revert 提交。

## Open Questions

（explore 已定；apply 仅需确认 `TeamRoster` 是否带 team 数字 id，见 D3——非阻塞。）
