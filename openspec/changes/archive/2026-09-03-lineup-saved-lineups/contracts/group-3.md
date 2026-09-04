# Contract — Group 3: 前端保存入口 + 已存阵容页

- **Spec**: 结果区每套候选 SHALL 对管理员提供「保存此阵容」（起名、队内唯一、同名覆盖），非管理员不见。已存阵容页 SHALL 列出该队所有已存阵容、按后端重判呈现四态（仍合法 / UTR 动了仍合法 / 已非法点名卡哪条 / 有人离队）并逐人点名快照 vs 当前 UTR 差异，MUST NOT 拿旧快照当合法性依据。已存阵容 SHALL 可一键载入（五线硬锁写进排阵 URL，坏 key 走 stale-link，不发带坏 key 搜索）。面板对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: 保存入口门控 / 四态渲染 / UTR-diff 点名 / 载入编码 / 既有 lineup 测试无回归
- **Code**: `lib/api.ts` 加类型 + 列出/重判 fetch（失败降级空列表，不拖垮）；`lib/admin.ts` 存/删 action。候选行保存入口（admin 门控只是表层）。新路由 `lineup/[code]/saved/`（`page.tsx` + `error.tsx`），四态用设计 token 着色，状态来自后端重判、diff 来自 utr_diff。载入 = assignment→五线 `lock=` 写 URL，坏 key 走 stale。前端不做数值比较。
- **Threshold**: 70
