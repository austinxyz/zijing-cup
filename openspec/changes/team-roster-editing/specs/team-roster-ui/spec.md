## ADDED Requirements

### Requirement: 队伍页就地解锁编辑模式
队伍页 SHALL 提供「编辑模式」开关：未登录时就地输入 admin 口令即解锁编辑（复用现有登录
server action，不跳 `/login`），密码错/限速沿用登录同款反馈；解锁后编辑控件出现。写操作
SHALL 仍由方法判权中间件保护——就地解锁只是入口，MUST NOT 新开信任面。只读用户 SHALL NOT
看到任何编辑控件。

#### Scenario: 就地输口令解锁
- **WHEN** 未登录用户在队伍页开启编辑模式并输入正确 admin 口令
- **THEN** 就地解锁编辑控件，无需离开该页

#### Scenario: 只读态无编辑控件
- **WHEN** 未解锁（只读）查看队伍页
- **THEN** 花名册为纯展示，不出现输入框、勾选、下拉或保存

### Requirement: 队伍页批量修改当前双打 UTR
编辑态下，花名册每名队员的**当前双打 UTR** SHALL 可就地输入；改动多名队员后 SHALL 由**一个
「保存」**一次提交（批量）。改动过的格子 SHALL 有可见标记。保存沿用既有「未锁季写双打 UTR
一并覆盖该赛季参赛 UTR、已锁季只改当前值」的语义，并在界面就近说明当前赛季是否会被覆盖。

#### Scenario: 批量保存
- **WHEN** 编辑态改了若干队员的当前双打 UTR 并点保存
- **THEN** 全部写入，随后读取返回新值

#### Scenario: 改动可见
- **WHEN** 改了某个双打 UTR 输入框
- **THEN** 该格显示未保存标记，保存后清除

### Requirement: 队伍页编辑外援/外卡/代表学校与学校数
编辑态下 SHALL 可改每名队员的 `is_borrowed_player`、`is_wildcard`，以及队伍的 `school_count`
（联队学校数）。`representing_school` **按条件**可编辑：勾了外援**或**外卡的队员，其学校控件
SHALL 禁用/清空（外部球员无本校可代表）；其余队员 SHALL 可选代表学校。设定 `school_count` 后
界面 SHALL 显示据此得出的外援名单/上场上限。名单里外援总数超过 `roster_cap(school_count)` 时，
保存 SHALL **警告放行**（醒目提示、允许保存，MUST NOT 硬拦）。

#### Scenario: 外援/外卡行学校禁用
- **WHEN** 勾选某队员为外援或外卡
- **THEN** 该行的代表学校控件禁用/清空

#### Scenario: 名单外援超上限警告放行
- **WHEN** 保存时名单外援数超过 roster_cap(school_count)
- **THEN** 呈现「超名单外援上限」警告但仍允许保存

#### Scenario: 学校数驱动上限提示
- **WHEN** 设定或改动 school_count
- **THEN** 界面显示对应的名单/上场外援上限
