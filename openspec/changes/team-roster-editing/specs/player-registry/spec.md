## ADDED Requirements

### Requirement: 队伍成员的外援/外卡/代表学校可写
后端 SHALL 提供写入 `PlayerTeamMembership` 的 `is_borrowed_player`、`is_wildcard`、
`representing_school` 的能力，按 `(队员, 队伍)` 定位。写入照旧由方法判权中间件保护（新写路由
不声明即要求管理员凭据）。这三个字段与「批量写当前 UTR 五字段」的端点**分开**——那个端点
MUST NOT 借此改 membership 字段，避免一个「UTR 导入」顺带改身份标记。

#### Scenario: 写外援/外卡/学校
- **WHEN** 管理员改某队员在某队的外援/外卡/代表学校并保存
- **THEN** 写入成功，随后读取返回新值

#### Scenario: 无管理员凭据拒绝
- **WHEN** 只带共享密钥、不带管理员凭据调用该写入
- **THEN** 返回 403

### Requirement: 队伍记录几所学校组成的联队数
`teams` SHALL 带一个可空的 `school_count`（联队由几所学校组成），可由管理员写入；`null` 表示
未设。它是外援上限规则唯一需要的学校信息，MUST NOT 由 `representing_school` 自动推导。

#### Scenario: 写学校数
- **WHEN** 管理员设定某队的 school_count
- **THEN** 写入成功，取队伍时返回该值

#### Scenario: 未设为 null
- **WHEN** 队伍从未设过 school_count
- **THEN** 该值为 null（而非 0）

### Requirement: 写当前双打 UTR 未锁季一并覆盖参赛值（批量同单条）
未锁季时写一名队员的当前双打 UTR SHALL 一并把该赛季的参赛 UTR 覆盖成同一个值（沿用既有单条
语义）；批量写多名队员时对每一名 SHALL 应用同一规则。赛季已锁时 MUST NOT 覆盖参赛值，只写
当前双打值。覆盖是 `Decimal` 全程、写显示值一律用后端字符串。

#### Scenario: 未锁季覆盖参赛值
- **WHEN** 赛季未锁，批量写若干队员的当前双打 UTR
- **THEN** 每人的该赛季参赛 UTR 被覆盖成同一个值

#### Scenario: 已锁季不覆盖
- **WHEN** 赛季已锁，写当前双打 UTR
- **THEN** 只改当前双打值，参赛 UTR 不变
