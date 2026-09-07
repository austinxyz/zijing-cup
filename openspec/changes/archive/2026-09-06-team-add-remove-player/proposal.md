---
Date: 2026-09-05
Change: team-add-remove-player
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-05-team-add-remove-player-requirements.md
---

## Why

队伍页编辑模式现在只能改已有队员的旗标/学校/校数——不能把一个队员加进本队、也不能把某队员移出
本队。后端 `add_membership` / `remove_membership` / `create_player` 端点早已就绪，只缺前端接线。
补上这一侧，队长就能自行加新报名的人、移退赛的人，不必等一份新的组委会总表。

## What Changes

- **加入队员**（`TeamEditPanel`，编辑模式）：新增「加入队员」控件。输姓名搜全库（跨赛季/组别，
  `getPlayers({query})`）→ 选中 → `POST /players/{id}/memberships` 加入本队；搜不到可**新建**
  （姓/名/性别 → `POST /players` 建全局队员 → 再 POST membership）。
- **移出队员**（`TeamEditPanel`，编辑模式）：每行加「移出」→ 就地确认 → `DELETE
  /players/{id}/memberships/{membership_id}`。队员本人与参赛 UTR、其它队 membership 保留。
- 加/移出经 `adminWrite` 按比赛 scope 判权，把后端 detail（已在本队 409 / 赛季锁 409）就地显示；
  成功后刷新名单。仅 `canEdit` 且编辑模式可见。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- **team-roster-ui** —— 队伍页编辑面板从「只改已有队员字段」扩展到「可加入 / 移出队员」（搜现有或
  建新人加入；行内确认移出）。

## Impact

- 前端：`app/[season]/[division]/teams/[code]/TeamEditPanel.tsx`（加「加入队员」控件 + 行内「移出」
  + 确认）；`teams/[code]/actions.ts`（新 server action：`addExistingPlayerToTeam`、
  `createAndAddPlayer`、`removePlayerFromTeam`——后者用 `getPlayer` 解析本队 membership_id 再 DELETE）；
  可能用到 `getPlayers`（搜索，已存在）。
- 后端：**无改动**（`add_membership`/`remove_membership`/`create_player` 端点与其赛季锁、重复、
  外键约束已就绪）。无新表、无 migration、不动鉴权。

## Out of Scope

- 批量加/移出；在队员工作台做加/移出（那边成员关系只读）；加入表单里填代表学校/外援/外卡（加入后用
  现有行内编辑再填）。
