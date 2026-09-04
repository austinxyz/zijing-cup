### Contract
- **Spec**: (team-roster-ui) 队伍页只读花名册 SHALL 显示一列「胜率」：`胜-负` 与百分比
  （`胜/(胜+负)` 前端派生、四舍五入到整数）。桌面表与手机卡片都 SHALL 显示。任一为 null 时
  SHALL 显示 `—`，MUST NOT 显示 `0-0`/`0%`。分母为 0 时百分比 SHALL 显示 `—`，MUST NOT 除零。
  撑不下沿用既有横滚，MUST NOT 令页面横向溢出。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/teams/[code]/RosterTable.test.tsx lib/winLoss.test.ts` (+ `npx tsc --noEmit`) → expected:
  胜率列渲染 `67-20`/`77%`、null → `—`、0-0 → 百分比 `—`；tsc 干净。
- **Code**: D4 —— `lib/api.ts` 的 `RosterPlayer` 加 `wins: number | null`、`losses: number | null`
  （后端漂移红 tsc，已在 group 3 前置）。D5 —— 显示 helper 三态：任一 null → `—`；和为 0 →
  `0-0` + 百分比 `—`；否则 `胜-负` + `round(w/(w+l)*100)%`。桌面 thead+row 与手机卡片都加；
  导入预览的 field→中文标签补 `wins`→「胜」`losses`→「负」，否则预览显示原始字段名。
- **Threshold**: 80
