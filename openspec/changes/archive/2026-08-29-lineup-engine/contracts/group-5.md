### Contract
- **Spec**:
  - 锁定的搭档与排除的队员 MUST 由 URL 表达，MUST NOT 只存在于客户端状态。
  - 结果区 SHALL 先呈现可达上限、规则允许的上限、两者差值，以及达到上限的十人组合数；
    之后才是候选列表。候选 MUST 已去重。
  - 每一套候选 SHALL 显示五条线各自的两名队员、**性别**、该线参赛 UTR 之和、超出量
    （若有），以及该套用掉的全队 buffer 与额度。
  - 当锁定或排除使可达上限下降，页面 SHALL 显式呈现这个差值。
  - 页面 MUST 在服务端取数，经 `frontend/lib/api.ts` 单一出口；客户端 bundle
    MUST NOT 包含后端地址或共享密钥。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，含 URL 表达锁定与排除、上限与组合数呈现、候选显示性别、锁定代价可见
- **Code**:
  - 锁定与排除从 URL 读，不进 React state——存一份就会与地址栏分歧，刷新与分享都会丢。
  - 性别是必需列：高 UTR 限制分性别设定，不显示性别就无法据界面核对这条约束。
  - 长列表要有自带的滚动容器，滚动放在内层，表头留在外面（壳是 `h-screen
    overflow-hidden`，见 CLAUDE.md Pitfalls）。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70
