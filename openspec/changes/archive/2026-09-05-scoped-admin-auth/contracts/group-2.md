### Contract
- **Spec**: (admin-access) 会话 SHALL 携带 `scope`（`"*"` 或 `"<season>:<division>"`），进 **HMAC 签名
  载荷**，篡改即签名失效。`authenticate(season, division, password)` SHALL 先比 super（现有
  `ADMIN_PASSWORD_HASH`）→ scope `"*"`；否则取该比赛 DB hash 比 → scope `"<season>:<division>"`；
  皆不中失败（沿用限速/反馈/失败关闭）。hash 只在 Next 侧算/比，明文 MUST NOT 到后端。无密码行的
  比赛 SHALL 只有 super 能解锁。
- **Runtime**: `cd frontend && npx vitest run lib/session.test.ts app/login` (+ `npx tsc --noEmit`) → expected:
  scope 往返签名、篡改作废、authenticate 三分支、无行只 super、读 hash 失败降级 false，全绿。
- **Code**: D1 —— `Session.scope`；`issueSession(scope)`/`readSession` 进出签名载荷；scope 取值 `"*"`
  或 `` `${season}:${division}` ``。D2/D3 —— 抽 `matches(hash,password)` 复用；`checkCompetitionPassword`
  走后端 GET（`X-Backend-Secret`，404/失败→false）；`authenticate` 三分支，限速在比对前。
- **Threshold**: 80
