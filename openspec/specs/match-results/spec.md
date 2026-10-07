# match-results Specification

## Purpose
记录已打完的团体赛对局（我方某队 vs 对手队、逐线用了谁、每线输赢），把赛后战果存成可查的情报，
供排阵时参考——尤其「我方对某对手队以前怎么排的、哪条线赢过」。全部为管理员机密。

## Requirements

### Requirement: 录入一场比赛

管理员（通过 `canEdit(season, division)`）SHALL 能录入一场已打完的比赛，含：日期（必填）、对手队
（同一 (season, division) 的另一支队）、轮次（可选自由文本）、我方逐线上场球员、对手逐线上场球员、
每线一个 win/loss 结果、每线一段可选自由文本备注。写 SHALL 经受保护写路由（`WRITE_METHODS` 中间件
自动保护）并带 scope `{season, division}`，成功后 `revalidatePath`。对手队 MUST 校验为同组另一支队，
跨组或自己对自己 SHALL 拒绝。

#### Scenario: 录入一场完整比赛
- **WHEN** 管理员填入日期、同组对手、我方与对手逐线球员、各线 win/loss，提交
- **THEN** 新增一条比赛记录，落库并在历史与对手对比处可见

#### Scenario: 拒绝跨组对手
- **WHEN** 选择的对手队不属于当前 (season, division)
- **THEN** 写被拒绝，返回错误而非落库

#### Scenario: 日期必填
- **WHEN** 提交时未填日期
- **THEN** 写被拒绝，提示日期必填

### Requirement: 我方阵容独立快照并可溯源

比赛的我方阵容 SHALL 存为该比赛自己的快照 `{line: [player keys]}`，而非外键引用某套已存阵容。
录入时系统 SHALL 支持「复制自某套已存阵容」预填再调整。比赛 SHALL 存一个**可空** `source_lineup_id`
仅作溯源；该 `source_lineup_id` 指向的 saved_lineup 被删或改名后，比赛记录仍 SHALL 完整显示其阵容
快照（不依赖外键目标存在）。

#### Scenario: 从已存阵容预填再改
- **WHEN** 管理员录入时选「复制自某套已存阵容」
- **THEN** 我方逐线按该套预填，可临场改人后保存为独立快照

#### Scenario: 溯源来源被删后仍完整
- **WHEN** 一场比赛的 `source_lineup_id` 指向的 saved_lineup 已被删除
- **THEN** 该比赛的我方阵容仍按快照完整显示，不报错、不丢人

### Requirement: 对手逐线球员引用名单，缺则留空

对手逐线上场球员 SHALL 引用对手队当季名单里的 player。个别对不上（借将、名单不全）的位置 SHALL
留空，读侧用「没有值」表示而非 0 或哨兵；展示时该位 SHALL 显示「未记录」而非误导性的空白或 0。

#### Scenario: 对手某线对不上名单
- **WHEN** 对手某线某位球员不在对手队名单中
- **THEN** 该位存为空，详情页该位显示「未记录」

### Requirement: 逐线结果与整场自动算分

每线 SHALL 存一个 win/loss 结果与一段可选备注。整场胜负 SHALL 由逐线结果按该 division 的
`scoring_mode` 自动计算：`match_count`（银组）数赢的线数，`points`（金组）按线位 points 加权；
该整场值 SHALL 只读、从不接受手填，始终以逐线结果为准。

#### Scenario: 银组按线数算整场
- **WHEN** 一场银组比赛逐线为 3 胜 2 负
- **THEN** 整场自动显示 3–2（胜），不需手填

#### Scenario: 金组按线位 points 加权算整场
- **WHEN** 一场金组比赛各线 win/loss 已录
- **THEN** 整场按各线位 points 加权自动算出我方得分对比

### Requirement: 比赛历史列表与逐线详情

系统 SHALL 提供一个比赛历史页，列出该 (season, division) 所有录过的比赛（我方队 / 对手 / 日期 /
轮次 / 整场结果），SHALL 支持按队筛选，并 SHALL 能点开一场看逐线详情（双方逐线球员 + 每线
win/loss + 备注）。该页 SHALL 从侧栏有入口。

#### Scenario: 列出并筛选比赛
- **WHEN** 管理员进入比赛历史页并按某队筛选
- **THEN** 只列出该队参与的比赛，每行显示日期/对手/轮次/整场结果

#### Scenario: 展开逐线详情
- **WHEN** 管理员点开一场比赛
- **THEN** 显示双方逐线球员、每线 win/loss 与备注

### Requirement: 逐线性别规则

每条线的双打搭档 SHALL 按该线 `kind` 满足性别规则，录入时前端 SHALL 当场拦截并说明、后端 create
SHALL 同样拒绝（双保险）：

- 男双（`mens_doubles`，D1/D2/D3）：无性别限制，女生可上。
- 混双（`mixed_doubles`，MD）：每方至少一名女生——两名**已知**男生非法（一男一女、两女均合法）。
- 女双（`womens_doubles`，WD）：每方必须两名女生——任何**已知**男生非法。

性别未知（null，典型为对手对不上名单的位置）SHALL **不**触发拒绝：它不能证明违规，对「未录」
fail-closed 会误拦合法的部分数据。

#### Scenario: 混双两名男生被拒
- **WHEN** 管理员把一条混双线填成两名男生并保存
- **THEN** 前端拦下并说明、后端 create 也返回 422，不落库

#### Scenario: 混双两名女生合法
- **WHEN** 一条混双线填两名女生
- **THEN** 允许保存（至少一女已满足）

#### Scenario: 女双出现男生被拒
- **WHEN** 一条女双线含一名男生
- **THEN** 前端拦下、后端返回 422

#### Scenario: 女生可上男双
- **WHEN** 一条男双线含女生
- **THEN** 允许保存（男双无性别限制）

#### Scenario: 对手性别未知不拦
- **WHEN** 对手某线两个位置都对不上名单（性别未知）
- **THEN** 不因性别规则拒绝（无法证明违规）

### Requirement: 全管理员机密与缺表降级

录入入口、历史页、以及对手对比的历史区 SHALL 全部按 `canEdit(season, division)` 门：免密队员
SHALL 看不到录入入口、历史页不可达、对手对比看不到历史区（读路径对非管理员不取、不渲染）。
当比赛记录表在远程尚未建好时，所有读路径 SHALL 降级为「无历史」而非 500。

#### Scenario: 免密队员看不到任何比赛数据
- **WHEN** 未解锁用户访问历史页或对手对比页
- **THEN** 历史页不可达、对手对比无历史区、无录入入口

#### Scenario: 表未建时降级
- **WHEN** 比赛记录表在远程尚未创建
- **THEN** 历史页、对手对比历史区、录入页均不崩，按「无历史」处理
