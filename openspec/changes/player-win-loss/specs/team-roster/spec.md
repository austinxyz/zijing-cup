## ADDED Requirements

### Requirement: 花名册响应带队员胜/负
`get_team_roster` 的每名队员 SHALL 带出 `wins`/`losses`（生涯战绩，来自 players）。
两者可空：`null` 表示从未导入战绩，MUST NOT 用 0 或哨兵冒充「未知」（0 是合法战绩）。
胜率是显示派生量，后端不算、不带出——只带 `wins`/`losses` 两个整数。

#### Scenario: 带出胜负
- **WHEN** 一名队员 `wins`=67、`losses`=20
- **THEN** 花名册响应里该队员带 `wins`=67、`losses`=20

#### Scenario: 未导入战绩带 null
- **WHEN** 一名队员从未导入战绩
- **THEN** 花名册响应里该队员 `wins`=null、`losses`=null
