## ADDED Requirements

### Requirement: 只读花名册显示胜率列
队伍页只读花名册 SHALL 显示一列「胜率」：`胜-负`（如 `67-20`）与百分比
（如 `77%`，由 `胜/(胜+负)` 前端派生、四舍五入到整数）。桌面表与手机卡片都 SHALL 显示。
`wins`/`losses` 任一为 null（从未导入）时 SHALL 显示 `—`，MUST NOT 显示 `0-0` 或 `0%`
（那是「真的 0 胜 0 负」的断言，与「未知」不同）。分母为 0（0 胜 0 负）时百分比 SHALL
显示 `—`，MUST NOT 除零。撑不下时沿用花名册既有横滚容器，MUST NOT 令页面横向溢出。

#### Scenario: 有战绩显示胜-负与百分比
- **WHEN** 一名队员 `wins`=67、`losses`=20
- **THEN** 胜率列显示 `67-20` 与 `77%`

#### Scenario: 未导入显示破折号
- **WHEN** 一名队员 `wins`/`losses` 为 null
- **THEN** 胜率列显示 `—`（非 `0-0`／`0%`）

#### Scenario: 0 胜 0 负不除零
- **WHEN** 一名队员 `wins`=0、`losses`=0
- **THEN** 显示 `0-0`，百分比显示 `—`（不 NaN、不除零）
