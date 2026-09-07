### Contract
- **Spec**: opponent-compare —— 「提供页面 `/[season]/[division]/compare`：两个『队+已存阵容』选择器…状态进 URL…某队无已存阵容空态…未选满引导空态」；「按 `canEdit(season,division)` gate：未解锁 MUST NOT 看到已存阵容、带到解锁入口/队伍页、无游客视图」。app-shell —— MODIFIED「应用壳提供侧栏导航」：「对手对比是可跳转的链接」指向 `/compare`。
- **Runtime**: `cd frontend && npm run test -- compare nav app-shell` → expected: 页面/选择器/gate/nav 单测过；`npx tsc --noEmit` 干净。
- **Code**: `compare/page.tsx`（server）读 searchParams→并发取 teams/rules + 每已选队 savedLineups+roster→`buildComparison`；`CompareControls`（client）两队+两阵容 select，改动 `router.push` 改 URL（改队清阵容 id），受控/按参数 key remount 防陈旧回填；起手 `canEdit` 否则 redirect；配 `compare/error.tsx`；`nav.ts` 的 opponents 项 `pending:false` + `href:${base}/compare`。名单实力对比不做。
- **Threshold**: 70

