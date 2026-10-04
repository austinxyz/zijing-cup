## ADDED Requirements

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
