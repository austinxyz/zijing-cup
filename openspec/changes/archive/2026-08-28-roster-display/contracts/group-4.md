### Contract
- **Spec**:
  - 前端 SHALL 在 `/[season]/[division]/teams` 提供球队列表，在
    `/[season]/[division]/teams/[code]` 提供某支球队的名单。选中的球队 MUST 由
    URL 表达，MUST NOT 只存在于客户端状态。
  - 未选中球队时，内容区 MUST 呈现提示选择球队的空状态，MUST NOT 呈现一张
    空的名单表格。
  - 球队列表的每一行 SHALL 显示球队 code、名单总人数，以及男、女各自的人数。
    性别为空的记录 MUST 单列一档计数。列表 SHALL 按 code 排序。
  - 名单页 MUST 在服务端取数，取数 MUST 经 `frontend/lib/api.ts` 单一出口。
    客户端 bundle MUST NOT 包含后端地址或共享密钥。
  - 已实现的导航项 SHALL 是指向该赛季组别下对应页面的链接。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含球队列表渲染、空状态、侧栏「队伍」是链接而「分析」不是
- **Code**:
  - 球队列放在 `teams/layout.tsx`（两条路由下都在），空状态是 `teams/page.tsx`。
    切换球队时球队列不重新挂载。
  - **空状态不重定向到第一支球队** —— 重定向会让地址栏自己变，而「第一支」
    是任意的（字母序下是 `BUAA-UMN-UCB`），读起来像系统替用户选了一支队。
  - 取数只经 `lib/api.ts`，Server Component 内完成。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70（视觉判断有固有主观性）
