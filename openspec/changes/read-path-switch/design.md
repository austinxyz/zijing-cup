## Context

上一个 change（`player-management`）建了四张表并把线上两季迁了进去：387 名队员、
489 条成员关系、405 条赛季 UTR、17 条未裁决。但**没有一个读取路径读它们**。
名单页、球队列表、排阵引擎全都还在读 `roster_entries` —— 一张导入器写、迁移命令读、
此后再没人更新的快照。

结果是管理界面成了一个写进黑洞的表单：改一个名字、裁决一个冲突，网站上什么都不变。

两套数据的形状差别是本次全部技术难点的来源：

| | `roster_entries`（旧） | 注册表（新） |
|---|---|---|
| 身份 | 每 (人, 赛季, 队) 一行，跨年不相连 | `players` 一人一行，跨年同一个 id |
| 参赛 UTR | `match_utr` **NOT NULL** | `player_season_utrs` 可以整条不存在 |
| 状态原文 | `dutr_status` 存总表原词 | 只存判定类别 + `under_appeal` 标志 |
| 冲突 | 不存在（一行一个值） | `is_unresolved` + 两个候选值 |
| 当前 UTR | 无 | `players.current_*_utr`（现全为 null） |

「NOT NULL → 可以没有」这一格是关键：旧模型里「在队」蕴含「有参赛 UTR」，新模型里不。
排阵引擎与名单页都需要一个明确的回答：这个人没有该赛季的值时，用什么数。

## Goals / Non-Goals

**Goals:**

- 三处读取（球队列表、球队名单、排阵名单）改读注册表，管理界面的修改立刻可见。
- 把「没有该赛季参赛 UTR」这个新状态表达成一条**共享的推导链**，名单页与排阵引擎
  对同一名队员给出同一个数字。
- 每一个推导出来的数字，在界面上都能被认出来是推导的。
- 旧的分享链接**响亮地**失效，而不是静默锁到别人。
- 名单 CSV 导入器挡住自己。

**Non-Goals:**

- 当前 UTR 的来源（同步 / 批量导入）。由项目负责人导入或在管理界面编辑。
- 名单导入器改写新表 —— 下一个 change。
- 删除 `roster_entries` —— 保留只读，作为回滚依据。
- 移动端版式。
- 任何 schema 变更。本次不写 migration。

## Decisions

### D1. 推导链放在 `backend/app/players/utr_chain.py`，纯函数

取值规则是**领域规则**，不是查询细节：它来自组委会总表自己的做法（Rated 直接用当前值，
Projected 用去年的 override）。两个消费方（`rosters/query.py`、`lineups/query.py`）
必须给出同一个数字，任何一处各写一遍都会漂移。

签名（形状，不是最终代码）：

```
resolve_match_utr(
    season_utrs: Sequence[SeasonUtrView],   # 该队员全部赛季，按年降序
    current_doubles: Optional[Decimal],
    current_doubles_status: Optional[str],
    season_year: int,
) -> Optional[ResolvedUtr]
```

`ResolvedUtr` 带 `value` / `origin` / `origin_year` / `is_unresolved`。返回 `None`
即「四步都取不到」。纯函数、无 session，测试不碰数据库。

**替代方案**：写成 SQL（一条带 window function 的查询）。否决 —— 四步回退里有一步
取决于 `current_doubles_status` 的字符串取值，塞进 SQL 后这条业务规则就只存在于一个
没人会读的 CTE 里，且两个消费方仍要各写一遍。

### D2. `origin` 是枚举，不是拼好的字符串

后端返回 `origin ∈ {frozen, current_doubles, prior_season}` 加 `origin_year`，
中文文案在前端拼。后端拼字符串会让「估算 · 2025 参赛值」这句话同时存在于 API 契约
和界面文案两个身份里，改文案要动后端测试。

### D3. 未裁决取较大值，且这件事要一路传到界面

`is_unresolved` 的行里取 `value`（迁移时已保证是较大的那个）。取较大值在合法性判断上
是安全方向 —— 参赛 UTR 是**上限**，取小会把违规阵容说成合法。但结果里必须报出人数，
否则页面在替一个还没做的裁决背书。

### D4. lineup key 加前缀 `p<player_id>`，旧格式必须解析失败

两套 id 都是小整数且互不相干。`roster_entries.id=142` 与 `players.id=142` 都存在、
都能解析成功、指向不同的人 —— 静默沿用就会让一个旧链接算出一套「看起来合法」的阵容，
而锁的是两个不相干的人。

`_parse_locks` 已经是「解析不了就拒绝，而不是跳过」的写法（见
`backend/app/routers/lineups.py`），本次沿用这条纪律，只是把纯数字明确识别成
**旧格式**并给出对应的错误，而不是笼统的 400。

**替代方案**：写一张 `roster_entries.id → players.id` 的映射表让旧链接继续工作。
否决 —— 那张表只能覆盖迁移过的两季，且会让「链接永远有效」这个承诺一直背在身上；
排阵链接的寿命是几小时，不值这个代价。

### D5. 三个旧字段留在响应里，值恒为 null

`dutr_status` / `source_note` / `daily_utrs` 在新来源里没有对应物。保留字段是为了不改
响应形状（前端类型、既有测试、可能的外部读取都不必跟着动），但 `dutr_status` 当前是
**必填 str**，要放宽成 `Optional[str]`。

这是本次唯一的响应类型变更，且是放宽而非收紧。spec 里配了一条「三者恒为 null」的
scenario，用意是把它钉成有意为之：一个恒为 null 的字段读起来像「总表没说」，事实是
「系统不再存它」。

### D6. `rating_class` 从 `player_season_utrs.status` 直接映射；Appeal 单独呈现

`verified → 已认证`、`committee → 委员会审定`、`captain → 队长评定`、`null → 待定`。
`under_appeal` 是独立布尔，界面上以 `<类别> · Appeal` 呈现。

Appeal 这一项在需求文档的逐字文案表里没有 —— 那张表只覆盖了本次**新增**的标记。
旧页面通过总表原文（`Rated / Appeal`）呈现 Appeal，原文一撤，不专门处理就会静默丢掉
一条信息。因此这里补了一条 spec 与一个文案；实现时按这条走。

### D7. 球队列表的人数改用成员关系 join 队员

`list_teams` 现在是一条 `Team LEFT JOIN RosterEntry ... GROUP BY code, gender`。
换成 `Team LEFT JOIN PlayerTeamMembership JOIN Player ... GROUP BY code, gender`，
保持一条查询、保持外连接（无人的队仍出现且计数为零）、保持 `ORDER BY code`。
性别未填照旧单独一档。

### D8. 导入器自锁用显式开关，不用环境变量

`backend/app/rosters/load.py` 默认拒绝并打印说明；`--i-know-it-is-not-read` 绕过。
用开关而不是环境变量，是因为绕过这件事该出现在**命令历史**里，而不是藏在某个
shell 的环境里被忘记。

## Risks / Trade-offs

- **[两处读取给出不同数字]** → 推导链是唯一实现（D1），且两个消费方各配一条断言
  「同一名队员两处取值相同」的测试。
- **[全队大面积估算，页面变成提示墙]** → 需求文档里已标记为「要盯的一件事」：顶部
  可能同时出现未裁决 / 未参与计算 / 截断 / 外援未校验四条，候选卡上还有估算。
  本次不预先设计收拢方式，在 VISUAL DIFF 那步拿 2026 银组真实名单（最长 26 人）
  实看后再定。
- **[`players.current_*_utr` 现全为 null，推导链第二步等于永远不命中]** → 属实。
  链的第二步现在是死路，直到负责人导入当前 UTR。这不是缺陷：第三步（最近有值赛季）
  会接住，且第二步一旦有数据就自动生效。名单页那句
  `当前 UTR 由人工维护，未与 UTR 官网同步` 正是为这个空窗写的。
- **[旧链接失效影响正在使用的人]** → 这是有意的（D4）。缓解是提示逐字说明原因并让人
  不改 URL 就能继续。
- **[迁移过的两季之外没有数据]** → 只有 2025 / 2026 迁过。更早的赛季在新来源里是空的；
  若有页面指向它们，会显示空名单而不是旧快照的内容。本次不补，`roster_entries` 保留
  只读作为回滚依据。

## Migration Plan

无 schema 变更，无 migration 文件。部署即切换。

**回滚**：本次全部改动都在读取侧且不写任何表，`git revert` 即回到读 `roster_entries`。
`roster_entries` 一行没动，也没有新表指向它，所以回滚不需要数据修复。唯一不可逆的是
切换期间在管理界面做的修改 —— 回滚后它们仍在新表里，只是又看不见了。

**部署顺序**：后端先上（新字段是增补，旧前端读不到它们也不会坏），前端后上。
反序会让前端读到不存在的字段。

## Open Questions

无。需求文档里挂着的两个（`roster_entries` 何时退休、推导链是否该写进
`docs/domain/rules.md`）都不阻塞本次实现，随 `roster_entries` 的退休 change 一起决定。
