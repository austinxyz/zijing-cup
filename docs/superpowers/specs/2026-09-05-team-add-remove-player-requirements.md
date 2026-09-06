---
Date: 2026-09-05
Change: team-add-remove-player
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# team-add-remove-player — 队伍页加/移出队员

队伍页（`/[season]/[division]/teams/[code]`）编辑模式现在只能改已有队员的旗标/学校/校数，
**不能把一个队员加进本队、也不能把某队员移出本队**。后端 `add_membership`（POST
`/players/{id}/memberships`）与 `remove_membership`（DELETE
`/players/{id}/memberships/{membership_id}`）早已就绪，只缺前端接线。本 change 把这两个动作接到
队伍页的编辑面板上。

## Goals

1. **加入队员（编辑模式）。** `TeamEditPanel` 增加「加入队员」控件，支持两种方式：
   - **搜现有**：输姓名搜全库（跨赛季/跨组别，走 `getPlayers({query})`）→ 选中 → POST membership
     把该队员加入本队。
   - **建新人**：搜不到时可建新人（姓/名/性别）→ 先 `POST /players` 建全局队员 → 再 POST
     membership 加入本队。
2. **移出队员（编辑模式）。** 编辑表格每行加「移出」按钮 → **就地确认** → DELETE 本队 membership。
   队员本人与其参赛 UTR、其它队的 membership 全部保留（离队不是离赛事），可以再加回。
3. **护栏与反馈沿用后端。** 重复加入（已在本队）后端 409、赛季锁定后端 409 —— 前端按比赛 scope
   经 `adminWrite` 调用、把后端的 detail 就地显示，而不是静默失败。加/移出后刷新名单。

## Non-Goals

- N/A (bounded)：不改后端（端点已就绪）、不加新表、不动鉴权；不做批量加/移出；不在队员工作台
  做加/移出（那边成员关系只读，本 change 只补队伍页这一侧）。

## Constraints

- 架构不可违反：写经 `lib/admin.ts` 的 `adminWrite`（按比赛 scope 判权、唯一写出口）；取数经
  `lib/api.ts`。加/移出只在 `canEdit(season,division)` 且编辑模式下可见（沿用 `TeamEditPanel` 的
  编辑门）。
- DELETE 需要 `membership_id`，而 `RosterPlayer` 不带它：移出的 server action 用
  `getPlayer(player_id)` 找到该队员在**本队**的 membership 取其 id 再 DELETE（前端解析，不改后端
  roster 响应）。add_membership 保证每队每人至多一条，故按 team 定位唯一。
- 后端全有或全无 + NOT NULL 等既有约束不变；空字符串字段（如 representing_school）加入时用
  null 而非 ""（与批量双打 UTR 那条同源）。

## Success Criteria

- 编辑模式下队伍页出现「加入队员」控件；搜姓名能选中一个已有队员并加入本队，名单随即出现他。
- 搜不到时可建新人（姓/名/性别）并加入本队；库里多出该全局队员 + 一条本队 membership。
- 每行「移出」经确认后把该队员从本队名单删掉；队员本人与参赛 UTR 仍在（可在队员工作台看到、也能
  再加回本队）。
- 加一个已在本队的人 → 显示「已在本队」类提示，不重复；赛季锁定时加/移出 → 显示赛季锁提示。
- 查看模式 / 未解锁本比赛时看不到加/移出控件。
- 真实数据实测：往 2025 某队加一个别队的人、建一个新人加入、移出一人，三者各自生效并正确刷新。

## User Stories

- 作为某组队长（该组已解锁），我想在队伍页直接把一个新报名的人加进本队，或把退赛的人移出，而不必
  等一份新的组委会总表。

## Open Questions

已定（bounded，无悬空歧义）：
- 加入时的 representing_school / 外援 / 外卡：加入只建 membership（这些留空/未标），加入后用现有
  行内编辑（`update_membership`）再填——不在「加入」表单里塞这些。
- `team_id` 来源：从队伍页已有的 roster/team 数据取（`getTeamRoster` 的队伍标识）；apply 时确认
  响应里有 team id，没有则由 season/division/code 解析。

## Referenced Capabilities

- **team-roster-ui**（本 change 主改：队伍页编辑面板加/移出队员的前端接线）。
- **player-registry**（复用后端 `add_membership`/`remove_membership`/`create_player` 端点与其
  赛季锁、重复、外键约束——本 change 不改后端）。
- **admin-access / admin-credentials**（复用 `canEdit(season,division)` + `adminWrite` 按比赛 scope
  判权）。
