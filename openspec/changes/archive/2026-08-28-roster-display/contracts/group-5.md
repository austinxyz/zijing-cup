### Contract
- **Spec**:
  - 球队名单 SHALL 按参赛 UTR 从高到低展示，列出姓名、性别、参赛 UTR 与
    UTR 来源。前端 MUST NOT 自行重新排序。
  - 名单的「UTR 来源」SHALL 同时呈现系统判定的评级类别与总表的原始状态文本。
    评级类别为空时 MUST 呈现为「待定」，MUST NOT 呈现为自评、委员会审定
    或任何其他具体类别。
  - 名单页取数失败或球队不存在时 MUST 只把内容区换成对应状态，侧栏与球队列
    MUST 仍然渲染。未知球队的 HTTP 状态 MUST 是 404。
  （移动端版式已移出本 change，见 specs/team-roster-ui/spec.md 末尾说明。）
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含排序不被前端改写、三种 UTR 来源呈现、「自评」字样不出现、未知球队 404
- **Code**:
  - 排序只在后端做一次。前端直接渲染返回顺序 —— 两处各排一次在参赛 UTR
    相同时会给出不同先后，而 UTR 打平在这份数据里很常见（多人压在同一个 cap）。
  - 「待定」用 `--color-warning`；女队员数偏少只加字重不上色 —— 同一屏两种
    「注意但不是错误」用同一颜色会分不清指什么。
  - `teams/[code]/error.tsx` 与 `not-found.tsx` 替换的只是名单区，球队列与
    侧栏都还在——换一支队正是这两种情况下的出路。
  - **不放 `loading.tsx`**：那个 Suspense 边界让 Next 提前 flush 响应头，
    `notFound()` 就再也返回不了 404（实测有它时未知球队返回 200）。
  - 移动端名单用行卡片而非表格的那条设计留给后续 `mobile-shell`；本组只做桌面。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70
