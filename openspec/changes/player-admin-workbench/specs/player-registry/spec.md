# player-registry Specification (delta: player-admin-workbench)

## ADDED Requirements

### Requirement: 队员列表查询支持按性别、队伍、参赛年份筛选
`list_players` 与 `count_players` SHALL 在现有 `q`（姓名/UTR链接）、`season`、`team_id`、
`unresolved` 之外，额外支持三个筛选维度，多维度以 AND 组合：

- `gender`：精确匹配 `Player.gender`。
- `team`：模糊匹配（ilike），同时匹配 `Team.code` 与 `Team.display_name`（中文队名）——命中任一
  即算。
- `year`：命中规则为「该队员在该年有参赛 UTR（`PlayerSeasonUtr.season_year`）**或** 该年在某队
  名单（`Team.season_year` 经 membership）」，两者任一即算。

`count_players` 的计数 SHALL 与 `list_players` 用同一套筛选，返回不受页上限影响的真实总数
（列表页上限 200 时，徽标/截断计数不得只数当前页）。

#### Scenario: 按性别筛选
- **WHEN** 传 `gender=F`
- **THEN** 结果只含性别为女的队员

#### Scenario: 按中文队名模糊筛选
- **WHEN** 传 `team=北大`
- **THEN** 结果为 `Team.display_name` 或 `Team.code` ilike 匹配「北大」的队伍里的队员

#### Scenario: 按参赛年份两者任一命中
- **WHEN** 传 `year=2025`
- **THEN** 结果含「2025 有参赛 UTR」或「2025 在某队名单」的队员，任一即入选

#### Scenario: 多维度 AND 组合
- **WHEN** 同时传 `gender=F` 与 `year=2025`
- **THEN** 结果只含 2025 命中且性别为女的队员

#### Scenario: 计数走真实总数
- **WHEN** 匹配数超过页上限 200 且带上述筛选
- **THEN** `count_players` 返回筛选后的真实总数，而非当前页行数
