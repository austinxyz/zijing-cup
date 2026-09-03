# Contract — Group 4: 就地编辑器（互换/替换 + 实时合法性 + 存回）

- **Spec**: 已存阵容页 SHALL 允许管理员就地编辑一套阵容——线间互换两人、从名单替换一人。每次编辑后 SHALL 用当前 UTR 经后端校验端点实时重判并就近呈现（合法 / 卡哪条）。编辑 SHALL 自由改、合法性是唯一护栏（重复上场等 violation 当场报），MUST NOT 预拦、MUST NOT 自动修。存回 SHALL 覆盖原阵容并重拍 UTR 快照。编辑器对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: 互换/替换改变 assignment、实时校验触发（防抖）、live 结果渲染合法/卡哪条、存回 action、既有测试无回归
- **Code**: D4 编辑器：五线十槽、替换=每槽下拉（整队名单）、互换=选两槽点「互换」对调。改动后调 `POST validate`（走 admin 出口），客户端防抖 ~300ms + 「校验中」态，live 合法/卡哪条就近呈现（复用 `Violation` message）。存回 = PUT 覆盖 + 重拍快照（server action）。重复上场靠 check_lineup 报、不前端预拦。用设计 token。前端不做数值比较。
- **Threshold**: 70
