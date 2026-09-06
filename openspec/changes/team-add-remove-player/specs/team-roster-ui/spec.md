# team-roster-ui Specification (delta: team-add-remove-player)

## ADDED Requirements

### Requirement: 队伍页编辑模式可加入队员（搜现有或建新人）
队伍名单页在编辑模式（`canEdit(season, division)` 且已切到编辑模式）下 SHALL 提供「加入队员」
控件：
- **搜现有**：按姓名搜全库队员（跨赛季/组别，`getPlayers({query})`），从结果选中一人 → 经
  `adminWrite` `POST /players/{id}/memberships`（body 含本队 `team_id`）把该队员加入本队。
- **建新人**：搜不到时 SHALL 可新建（姓、名、性别）→ 先 `POST /players` 建一个跨赛季的全局队员 →
  再 POST membership 加入本队。

加入 SHALL 只创建 membership（代表学校 / 外援 / 外卡留空/未标，加入后用既有行内编辑再填）。加入
成功后名单 SHALL 刷新出现该队员。控件 MUST NOT 在查看模式或未解锁本比赛时出现。

后端拒绝时（该队员已在本队 → 409；本赛季已锁定 → 409）SHALL 就地显示后端的 detail，MUST NOT
静默失败。

#### Scenario: 搜现有加入本队
- **WHEN** 编辑模式下搜到一个不在本队的队员并点「加入本队」
- **THEN** 该队员被加入本队，名单刷新后出现他

#### Scenario: 建新人加入本队
- **WHEN** 编辑模式下搜不到，填姓/名/性别并「新建并加入本队」
- **THEN** 库里新增一个全局队员 + 一条本队 membership，名单出现他

#### Scenario: 重复加入被挡
- **WHEN** 加入一个已在本队的队员
- **THEN** 显示「已在本队」类后端提示，不新增第二条 membership

#### Scenario: 查看模式无加入控件
- **WHEN** 查看模式或未解锁本比赛
- **THEN** 页面不出现「加入队员」控件

### Requirement: 队伍页编辑模式可移出队员（就地确认）
编辑模式下名单每行 SHALL 提供「移出」：点击后 SHALL 就地确认，确认后经 `adminWrite`
`DELETE /players/{id}/memberships/{membership_id}` 把该队员从本队删除。`membership_id` 由前端用
`getPlayer(player_id)` 找到该队员在**本队**的 membership 解析得到（后端 roster 响应不带它，且每队每人
至多一条 membership，故按 team 定位唯一）。

移出 SHALL 只删本队 membership——队员本人、其参赛 UTR、其它队的 membership 全部保留，可再加回。
移出 MUST NOT 在查看模式或未解锁时出现；赛季锁定时后端拒绝（409），前端就地显示理由。

#### Scenario: 确认后移出
- **WHEN** 编辑模式下点某行「移出」并确认
- **THEN** 该队员从本队名单消失，但其队员记录与参赛 UTR 仍在（可在队员工作台看到、也能再加回）

#### Scenario: 移出需要确认
- **WHEN** 点「移出」但未确认
- **THEN** 不发起删除；出现就地确认（确认 / 取消）

#### Scenario: 查看模式无移出
- **WHEN** 查看模式或未解锁本比赛
- **THEN** 名单行不出现「移出」按钮
