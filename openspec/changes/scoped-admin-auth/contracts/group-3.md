### Contract
- **Spec**: (admin-access) 系统 SHALL 提供 `canEdit(season, division)`（`scope==="*" || scope===该比赛`）
  取代全局判据，所有「能否编辑」取值点改按比赛判。`adminWrite` SHALL 收目标比赛、发请求前校验 scope
  覆盖，盖不住 SHALL 抛错且 MUST NOT 发带 `X-Admin-Secret` 的请求。
- **Runtime**: `cd frontend && npx vitest run lib/admin.test.ts "app/[season]/[division]"` (+ `npx tsc --noEmit`) → expected:
  canEdit 按比赛真假、adminWrite 越权抛错不发请求、作用域内照发、各页/控件按比赛显隐，全绿；tsc 干净。
- **Code**: D4 —— `canEdit(season,division)`；`adminWrite` 新增 `scope` 参数（默认 `"super-only"`，失败
  关闭：漏传则只 super 能写），`assertScope` 覆盖不了抛 `NotAuthorizedForCompetition` 不发；各写 server
  action 把绑定的 (season,division) 传下去；layout/teams/lineup/saved/players/utr 的取值点改按比赛；就地
  解锁表单带 season/division 隐藏字段。
- **Threshold**: 80
