## REMOVED Requirements

### Requirement: 外援限制不校验且明说

**Reason**: 这个 change 让外援上场上限真正进引擎——不再是「不校验且明说」，改由下方
「外援上场上限按队伍学校数校验」取代。
**Migration**: `borrowed_players_checked` 从恒 false 变为在有 `school_count` 时为 true；
原「外援限制未被校验」声明由具体校验与 `borrowed_over_limit` 无解原因取代。`school_count`
未填的队伍仍不校验（此时 `borrowed_players_checked` 为 false，与旧行为一致）。

## ADDED Requirements

### Requirement: 外援上场上限按队伍学校数校验
一支队每场能上场的外援人数上限由该队的**学校数**（`school_count`，几所学校组成的联队）决定，
按 division 数据化存储的规则给出。搜索 SHALL 校验**上场十人**里 `is_borrowed_player` 为真的
人数 ≤ 该队的 `on_court_cap(school_count)`；超过的阵容 MUST NOT 作为合法候选。规则按 division
存（如 `division_borrowed_limits(division_id, school_count, roster_cap, on_court_cap)`）并随
seed 灌入，可逐赛季/组别改数据而不改代码。

当队伍的 `school_count` **未设**时，SHALL NOT 因外援拦搜索（未知不等于 0），此时
`borrowed_players_checked` 为 false；`school_count` 已设时校验并置 `borrowed_players_checked`
为 true。`is_wildcard` 不参与本校验。

#### Scenario: 上场外援超上限不作为候选
- **WHEN** 某阵容上场十人里外援数超过该队 on_court_cap(school_count)
- **THEN** 该阵容不出现在候选里

#### Scenario: 学校数未设则不拦
- **WHEN** 队伍未设 school_count
- **THEN** 搜索不因外援限制排除任何阵容，且结果标明外援限制未按上限校验

#### Scenario: 规则随 division
- **WHEN** 两个 division 的外援上限规则不同
- **THEN** 各自按本 division 的 division_borrowed_limits 校验

### Requirement: 外援超上限的无解以专门原因呈现
当外援上场上限使某线/整体凑不出合法阵容时，无解结果 SHALL 以一个**专门的原因类型**
`borrowed_over_limit` 表达，点名是哪些外援、上场外援数与上限各是多少，沿用既有 infeasibility
原因/归因结构（不并入光秃秃的一句、不与其它资格原因混淆）。

#### Scenario: 外援超限点名
- **WHEN** 因上场外援超上限导致无解
- **THEN** 结果给出 borrowed_over_limit 原因，点名涉及的外援并说明超出量
