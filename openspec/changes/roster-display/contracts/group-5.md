### Contract
- **Spec**:
  - 球队名单 SHALL 按参赛 UTR 从高到低展示，列出姓名、性别、参赛 UTR 与
    UTR 来源。前端 MUST NOT 自行重新排序。
  - 名单的「UTR 来源」SHALL 同时呈现系统判定的评级类别与总表的原始状态文本。
    评级类别为空时 MUST 呈现为「待定」，MUST NOT 呈现为自评、委员会审定
    或任何其他具体类别。
  - 名单页取数失败时 MUST 只把内容区换成错误态，侧栏与应用壳 MUST 仍然渲染。
    页面 SHALL 提供加载态而不是白屏。
  （移动端版式已移出本 change，见 specs/team-roster-ui/spec.md 末尾说明。）
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含排序不被前端改写、三种 UTR 来源呈现、「自评」字样不出现、未知球队 404
- **Code**:
  - 排序只在后端做一次。前端直接渲染返回顺序 —— 两处各排一次在参赛 UTR
    相同时会给出不同先后，而 UTR 打平在这份数据里很常见（多人压在同一个 cap）。
  - 「待定」用 `--color-warning`；女队员数偏少只加字重不上色 —— 同一屏两种
    「注意但不是错误」用同一颜色会分不清指什么。
  - `teams/[code]/error.tsx` 替换的只是名单区，球队列与侧栏都还在。
  - 移动端名单用行卡片而非表格的那条设计留给后续 `mobile-shell`；本组只做桌面。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70
