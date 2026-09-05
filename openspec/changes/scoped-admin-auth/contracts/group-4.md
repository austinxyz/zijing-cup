### Contract
- **Spec**: (admin-credentials) 系统 SHALL 提供仅 super 可用的改密码页：选赛季/组别 + 输新密码 →
  server action 先校验 scope `"*"` → Next 侧算 hash → PUT 写 `admin_credentials`。非 super SHALL 打不开
  且 server action MUST 拒绝执行、不发 PUT。写入后该比赛旧密码立即失效。
- **Runtime**: `cd frontend && npx vitest run app/admin lib/admin.test.ts` (+ `npx tsc --noEmit`) → expected:
  非 super action 抛错、adminWrite 未调用；super → hashPassword + PUT("super-only")；非 super 页不渲染
  表单；全绿；tsc 干净。
- **Code**: D6 —— `isSuper()`（scope `"*"`）；`setCompetitionPassword(season,division,password)`：
  非 super 抛 `NotAuthorizedForCompetition`、不发 PUT；否则 `hashPassword` → `adminWrite("PUT",
  ".../admin-credential", {password_hash}, "super-only")`（双重保险）。super-only 页 server 组件先
  `isSuper()` 才渲染表单，否则提示。
- **Threshold**: 80
