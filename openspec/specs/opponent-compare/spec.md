# opponent-compare Specification

## Purpose
排阵前把自己准备的一套阵容与预判对手会上的一套（提前给对手队存好的某套已存阵容）逐线并排，看每条
线领先/落后多少。对手实际当场阵容不可知，所以对手侧同样取自已存阵容，当作一种可能。只摆事实（UTR 和
的对比），不判胜负、不预测比分。

## Requirements

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

### Requirement: 阵容上场人员预览

选一侧（队 + 已存阵容）后，系统 SHALL 在该侧 picker 下方就地显示这套阵容的上场人员，
不必等另一侧也选好。阵容下拉的每个选项 SHALL 带一段上场签名以便未选前分辨各套。名单按
规则线序逐线呈现，每人显示姓名、性别、参赛 UTR，姓名/性别经该队 roster 的 `key→player`
解析（与逐线对比表同一套解析），本需求纯前端、不新增后端端点。

#### Scenario: 选完一侧即见名单
- **WHEN** 已解锁用户在某一侧选好队与一套已存阵容、另一侧尚未选
- **THEN** 该侧下方按线序列出这套阵容的 5 线上场人员（姓名 + 性别 + 参赛 UTR）

#### Scenario: 下拉选项带签名
- **WHEN** 某队有多套已存阵容
- **THEN** 阵容下拉每个选项除名字外带上场签名（如首线搭档），选前即可分辨

### Requirement: 保存对比

系统 SHALL 提供一张 `zijing_cup.saved_comparisons` 表，按 `(season_year, division_code)`
存一条对比的**引用**：`name`、`team_a_code`、`lineup_a_id`、`team_b_code`、`lineup_b_id`、
`line_notes`(JSONB)、创建/更新时间戳；`name` 在 `(season, division)` 内唯一，同名覆盖。
存的是引用而非快照——展开查看时按引用**实时重算**对比。管理员两侧都选好后 SHALL 能起名
保存为一条对比；空名/超长 SHALL 拒绝。建/改/删走受保护写路由（`WRITE_METHODS` 中间件自动
保护，`adminWrite` scope `{season,division}`）。

#### Scenario: 保存当前搭配为一条对比
- **WHEN** 管理员两侧都选好队与阵容、填入一个不重复的名字并保存
- **THEN** 新增一条 `saved_comparisons`（存四个引用），顶部「已存对比」出现这张卡

#### Scenario: 同名覆盖
- **WHEN** 管理员用一个已存在的名字保存
- **THEN** 覆盖该同名对比而非新增第二条

#### Scenario: 空名拒绝
- **WHEN** 管理员未填名字就保存
- **THEN** 拒绝、不写库

### Requirement: 已存对比展开/折叠

/compare 顶部 SHALL 把本赛季/组别的已存对比列为可展开/折叠的卡：折叠只显示名字与两侧
队/阵容名；**展开就地渲染这套对比**（按引用实时重算的逐线并排 + 差距 + 总和），折叠收起。
展开 SHALL NOT 跳转、SHALL NOT 改 URL、SHALL NOT 改动上方 picker（picker 只用于新建）。
每张卡 SHALL 可删除。

#### Scenario: 展开就地看对比
- **WHEN** 用户点开一张已存对比卡
- **THEN** 卡内就地渲染这套对比的逐线并排（按当前 saved_lineup 实时重算），不跳转、不动 picker

#### Scenario: 折叠收起
- **WHEN** 用户点已展开卡的行
- **THEN** 卡收起、只剩名字与两侧概要

#### Scenario: 删除对比
- **WHEN** 管理员删除一张已存对比卡
- **THEN** 该 `saved_comparisons` 行被删，卡从列表消失

### Requirement: 每线备注

已存对比 SHALL 支持每条线一条可覆盖的备注，存于 `saved_comparisons.line_notes` JSONB
（`{line_code: text}`）。在某张对比的**展开态**里，逐线表每行 SHALL 有一格「本线备注」供
管理员就地编辑（写回该对比）、清空即删该线备注；非编辑态只读显示。备注 SHALL 只属于已存
对比——即席（未保存）对比不提供每线备注。

#### Scenario: 写一条本线备注
- **WHEN** 管理员在展开的对比卡里给某条线填入备注并保存
- **THEN** 该文本写入 `line_notes[line_code]`，再次展开仍显示

#### Scenario: 清空本线备注
- **WHEN** 管理员把某条线的备注清空
- **THEN** `line_notes` 里该 `line_code` 被移除

#### Scenario: 即席对比无备注
- **WHEN** 用户只在 picker 里搭配、尚未保存
- **THEN** 不提供每线备注编辑（需先保存成卡）

### Requirement: 引用阵容被删的降级

当某条已存对比引用的 saved_lineup 已不存在时，系统 SHALL 保留该对比（不 cascade 删除），
展开时该侧 SHALL 标「阵容已删」且不渲染该侧线格与差距，不得崩页。

#### Scenario: 某侧阵容已删
- **WHEN** 展开一条对比、其某侧 `lineup_id` 指向的 saved_lineup 已删
- **THEN** 该对比仍在列表；展开时该侧显示「阵容已删」、不渲染该侧，页面不崩

### Requirement: 已存对比读取降级与机密门

已存对比与其备注属管理员机密，读写 SHALL 在 `canEdit(season, division)` 之后；未解锁 SHALL
维持既有就地锁定态、不发取机密数据请求。只读列出端点/取数失败或表未建时，前端 SHALL 降级为
空（顶部「已存对比」为空）、页面其余照常，不得 500。写入无管理员凭据 SHALL 被拒。

#### Scenario: 未解锁不取不显
- **WHEN** 未解锁用户访问 /compare
- **THEN** 就地锁定态、不列出任何已存对比、不发取机密数据请求

#### Scenario: 表未建/取数失败降级
- **WHEN** `saved_comparisons` 表尚未建或列出端点失败
- **THEN** 顶部「已存对比」为空，/compare 其余功能照常，不 500

#### Scenario: 无凭据写被拒
- **WHEN** 无管理员凭据调用建/改/删/写备注端点
- **THEN** 被中间件拒绝（401/403）
