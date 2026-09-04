# Contract — Group 4

- **Spec**: 排阵页/已存阵容页 SHALL 提供「编辑模式」开关，就地输入 admin 密码即解锁已有编辑能力（保存候选、编辑/删除已存阵容、载入后保存），无需跳 `/login`；解锁 SHALL 复用现有登录 server action 与会话，密码错/限速沿用登录同款反馈；写操作 SHALL 仍由方法判权中间件保护、MUST NOT 新开信任面。
- **Runtime**: `cd frontend && npm run test` → expected: 编辑模式开关渲染口令输入、正确口令调 login action、错误口令渲染同款反馈、既有测试无回归 全通过
- **Code**: D5 新客户端组件 `EditModeToggle`：开关→口令输入→调**现有** `login`（`useActionState`），成功 `router.refresh()` 让 server 重读会话、`canEdit` 变真；失败用 login 返回的 `bad-password`/`rate-limited` 文案。会话仍 httpOnly cookie；写路由仍方法判权；已登录显示「已解锁·登出」。
- **Threshold**: 70
