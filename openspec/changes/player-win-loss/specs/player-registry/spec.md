## ADDED Requirements

### Requirement: 队员带生涯胜/负场次
队员 SHALL 带一对可空的整数 `wins` / `losses`（生涯战绩，跨赛季，最新一次导入为准）。
两者皆可空：`null` 表示从未导入过战绩，与 `0`（真的 0 胜或 0 负）是不同的断言，
MUST NOT 用 0 表示未知。总场次与胜率 MUST NOT 入库——它们分别是 `wins + losses` 与
`wins / (wins + losses)` 的派生量，只在呈现层算。

#### Scenario: 战绩可空且默认未设
- **WHEN** 一名队员从未导入过战绩
- **THEN** 其 `wins` 与 `losses` 为 null（而非 0）

#### Scenario: 存整数胜负
- **WHEN** 导入把某队员写成 67 胜 20 负
- **THEN** 其 `wins` = 67、`losses` = 20，读取时返回这两个值
