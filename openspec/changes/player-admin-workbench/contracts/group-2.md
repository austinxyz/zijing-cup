### Contract
- **Spec**: player-registry（同上筛选维度，前端取数出口须能传）；player-admin-ui —— 「左栏 SHALL 支持按…性别…所在队伍（模糊…）…参赛年份…筛选」的取数支撑。
- **Runtime**: `cd frontend && npm run test -- lib/api` → expected: `getPlayers`/`getPlayersPage` 把 gender/team/year 拼进 query string 的单测过；`npx tsc --noEmit` 干净（vitest 不做类型检查，须单列 tsc）。
- **Code**: `PlayerFilters` 加 `gender?: string`、`team?: string`、`year?: number|string`；`PlayerPageFilters` 继承；`getPlayers`/`getPlayersPage` 各自 `params.set`（有值才设）。契约字段用 literal / 明确类型，避免后端漂移静默。
- **Threshold**: 80

