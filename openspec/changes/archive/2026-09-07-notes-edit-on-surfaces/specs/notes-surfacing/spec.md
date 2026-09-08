## ADDED Requirements

### Requirement: roster 编辑模式下评价可就地编辑

在队伍名单页（roster），当会话 `canEdit(season, division)` 且处于编辑模式时，评价弹层 SHALL 从只读变为
可编辑：顶部有追加表单（类别下拉 + 文本框 + 追加按钮），时间线每条 SHALL 有就地确认删除。追加/删除
经既有 `addPlayerNote`/`deletePlayerNote`（`adminWrite` 按比赛 scope），成功后靠 `revalidatePath` 刷新。
空文本 MUST NOT 可提交；写失败 SHALL 就地报错、不静默吞。

#### Scenario: 编辑模式追加一条评价
- **WHEN** roster 已解锁且在编辑模式，打开某队员的评价弹层，选类别、填文本、点追加
- **THEN** 调 `addPlayerNote(season, division, playerId, category, body)`，成功后该条出现在时间线顶部

#### Scenario: 编辑模式删除一条评价
- **WHEN** 在可编辑弹层点某条的删除并确认
- **THEN** 调 `deletePlayerNote(season, division, playerId, noteId)`，成功后该条消失，其余保留

#### Scenario: 空文本不可追加
- **WHEN** 追加表单文本为空或仅空白
- **THEN** 追加按钮不可用，不发写请求

### Requirement: 无评价的队员有「记评价」入口

在 roster 编辑模式下，没有任何评价（因而没有分类小标可点）的队员 SHALL 显示一个「＋记评价」入口，
点击打开同一个可编辑弹层以追加第一条。查看模式下 MUST NOT 显示该入口。

#### Scenario: 无评价队员加第一条
- **WHEN** roster 编辑模式，某队员没有评价
- **THEN** 该行显示「＋记评价」入口；点击打开可编辑弹层，可追加第一条

#### Scenario: 查看模式不显示编辑入口
- **WHEN** roster 处于查看模式（或会话不可编辑）
- **THEN** 不显示「＋记评价」入口，评价弹层无追加表单与删除按钮

### Requirement: 编辑能力仅限 roster 编辑模式，其余保持只读

评价的编辑能力 SHALL 是共享展示组件上的**可选**能力，仅 roster 在编辑模式时启用。排阵（候选卡、
已存阵容）、对手对比两侧、以及 roster 的查看模式 MUST 保持只读——不传可编辑标志，无追加表单、无删除、
无「记评价」入口，只读展示形态（分类小标 / seat「评」/ 倒序时间线弹层）不变。

#### Scenario: 排阵与对手对比不受影响
- **WHEN** 打开排阵页或对手对比（无论是否解锁）
- **THEN** 评价仍只读：无追加/删除控件，展示与 `notes-surfacing` 只读时一致

#### Scenario: 只读弹层不含写控件
- **WHEN** 在任何只读入口打开评价弹层
- **THEN** 弹层只有倒序时间线，无追加表单、无删除按钮
