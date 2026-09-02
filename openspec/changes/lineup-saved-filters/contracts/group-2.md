### Contract
- **Spec**: 排阵页 SHALL 列出该队所有 preset（名 + 规模），载入 SHALL 把锁定/排除写回 URL 参数、页面据此重渲染、结果与手填一致，列出/载入 MUST NOT 需登录。SHALL 只对管理员显示存/删入口，至少一条约束才可存、空约束 MUST NOT 可存，非管理员 SHALL 只见列表+载入。载入 preset 的**锁定**引用了已不在 search.roster 的球员时页面 SHALL 明说过期、指出失效的锁与人、给删/重建入口，MUST NOT 静默应用剩余、MUST NOT 呈现看似健康的候选列表、MUST NOT 猜替补；只有**排除**引用离队球员时 SHALL 照常载入，MAY 中性提示。面板 SHALL 对比度 ≥4.5:1、桌面与 <768 都读得清不横向溢出、触摸目标 ≥44px。
- **Runtime**: `cd frontend && npm run test` → expected: preset 列表/载入门控/失效（锁定拒载、排除照常）新测试通过、既有 lineup 测试无回归
- **Code**: D2 失效检查前端比对 search.roster：锁定任一位不在→拒载面板，排除不在→照常载入。D3 载入=导航写回 query（保持 URL 唯一记录），存/删走 lib/admin.ts server action（in-app 浏览器 requestSubmit()）。lib/api.ts 加列出类型+fetch。用设计 token（warning 拒载、中性档提示、primary 载入、danger 删除），不硬编码 hex。admin 门控只是表层，写权限后端方法判权。
- **Threshold**: 70
