# opponent-compare Specification (delta: opponent-compare)

## Purpose
排阵前把自己准备的一套阵容与预判对手会上的一套（提前给对手队存好的某套已存阵容）逐线并排，看每条
线领先/落后多少。对手实际当场阵容不可知，所以对手侧同样取自已存阵容，当作一种可能。只摆事实（UTR 和
的对比），不判胜负、不预测比分。

## ADDED Requirements

### Requirement: 分区级对手对比页
系统 SHALL 提供页面 `/[season]/[division]/compare`：两个「队 + 已存阵容」选择器（我方 / 对手），各
选一支**本赛季本组别**的队与它的一套已存阵容。两侧对等，无强制主客。选择器状态 SHALL 进入 URL
（可分享、刷新保持）。某队没有已存阵容时该侧 SHALL 呈现空态提示而非报错。未选满两侧时页面 SHALL
呈现引导空态而非空白。

#### Scenario: 选满两侧后逐线并排
- **WHEN** 我方与对手各选好「队 + 已存阵容」
- **THEN** 页面逐线并排显示两套阵容

#### Scenario: 条件在 URL
- **WHEN** 选好两侧
- **THEN** 选择结果出现在 URL，刷新或分享该链接得到同一对比

#### Scenario: 某队无已存阵容
- **WHEN** 某侧选中的队没有任何已存阵容
- **THEN** 该侧呈现空态提示，不报错

### Requirement: 逐线并排只摆事实
对比 SHALL 按规则线序（`getDivisionRules` 的 `lines`，不写死）逐线并排：每线显示我方两人（姓名 +
性别 + 该线当前 UTR 和）、对手两人（同上）、以及**差距 = 我方线和 − 对手线和**；底部 SHALL 有一行
两队**总 UTR 和**与其差。姓名与性别 SHALL 由各队 roster（`getTeamRoster`）按球员 key 解析——已存
阵容只存 key，不带姓名。对比 MUST NOT 判定胜负或预测比分，只呈现 UTR 数值与差。

#### Scenario: 每线两对 + 差距
- **WHEN** 查看某一线
- **THEN** 显示我方两人（姓名+性别+线 UTR 和）、对手两人、以及两者线和的差

#### Scenario: 线位按规则线序对齐
- **WHEN** 渲染逐线表
- **THEN** 行顺序与该组别规则的线序一致，两队同线对齐

#### Scenario: 不判胜负
- **WHEN** 某线我方 UTR 和高于对手
- **THEN** 显示正的差距数值，但不出现「胜」「赢」一类的胜负判定或比分预测

### Requirement: 对比用当前值并标注陈旧或非法阵容
对比 SHALL 使用已存阵容的**当前**重算值（`line_totals` / `total`）。若某侧已存阵容当前 `status` 为
`utr_moved` / `illegal` / `player_gone`，该侧 SHALL 明确标注其状态（不把陈旧或非法阵容当作有效来
比）；`player_gone` 无法算总和时 MUST NOT 显示一个假的总和。

#### Scenario: 陈旧阵容被标注
- **WHEN** 某侧阵容当前 status 是 utr_moved 或 illegal
- **THEN** 该侧标出其状态，仍用当前重算值呈现

#### Scenario: 缺人阵容不硬凑总和
- **WHEN** 某侧阵容当前 status 是 player_gone
- **THEN** 标出其状态，且不显示该侧的假总和

### Requirement: 对手对比页是管理员机密，按比赛判权
`/compare` 展示两队的已存阵容，而已存阵容是管理员机密。页面 SHALL 按 `canEdit(season, division)`
gate：未解锁本比赛者 MUST NOT 看到任何已存阵容内容。未解锁时页面 SHALL **就地呈现锁定态**——一条
说明 + 就地解锁入口（`EditModeToggle`），留在 /compare 上而不是静默重定向走；解锁成功后刷新即显示
对比。**无游客查看模式**（锁定态不含任何已存阵容内容，且 MUST NOT 发起取已存阵容/roster 的请求）。

#### Scenario: 未解锁看到锁定态而非被弹走
- **WHEN** 未解锁本比赛的人访问 /compare
- **THEN** 留在 /compare，看到锁定说明 + 就地解锁入口，不显示任何已存阵容，也不发起取已存阵容的请求

#### Scenario: 解锁后可用
- **WHEN** 已解锁本比赛
- **THEN** 可选队与阵容并看到逐线对比
