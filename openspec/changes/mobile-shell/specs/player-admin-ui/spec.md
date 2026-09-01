## ADDED Requirements

### Requirement: 管理界面的 UTR 链接是可点的
队员列表与队员详情页在 `utr_profile_id` 有值时 SHALL 把它呈现为指向该队员 UTR 官网
档案页的链接，MUST NOT 只呈现为不可点的文字或一个「有 / 无」的指示。

这两处此前都把网址写出来却点不动：详情页逐字显示 `…/profiles/{id}`，列表显示「有」。
一个写出来的网址若点不动，读的人还得手工拼一次。

网址 SHALL 由与名单页相同的那一个常量拼出，MUST NOT 各写一份字面量。外链 SHALL 带
`rel="noopener noreferrer"`。

`utr_profile_id` 为空时列表 SHALL 仍然呈现「无」（它是将来合并的唯一依据，缺失必须
可见），但 MUST NOT 呈现为链接或错误。

本条只改这两处的可点性，**不为管理界面提供窄视口版式**——管理界面在窄视口下仍是桌面
版式，需要横向滚动。这是本次的既定取舍。

#### Scenario: 详情页的链接可点
- **WHEN** 打开一名 `utr_profile_id` 有值的队员详情页
- **THEN** 该字段呈现为指向 `https://app.utrsports.net/profiles/<该值>` 的链接
- **AND** 该链接带 `rel="noopener noreferrer"`

#### Scenario: 列表的「有」可点
- **WHEN** 队员列表中某行的 `utr_profile_id` 有值
- **THEN** 该行的 UTR 链接一栏呈现为可点开官网档案页的链接

#### Scenario: 缺失仍然可见但不是链接
- **WHEN** 某队员的 `utr_profile_id` 为空
- **THEN** 列表该栏仍然显示「无」
- **AND** 该处不是链接，也不呈现为错误

#### Scenario: 网址与名单页共用同一个常量
- **WHEN** 检索前端源码中的 UTR 官网网址
- **THEN** 只存在一处字面量定义，名单页与管理界面都引用它
