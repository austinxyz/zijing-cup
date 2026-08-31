### Contract
- **Spec**: 有队员因缺少参赛 UTR 未参与计算时，页面 SHALL 在顶部逐字呈现 `本队 N 人因缺少参赛 UTR 未参与计算`，用中性档；N 为 0 时 MUST NOT 呈现。未裁决 N 大于 0 时逐字呈现 `本结果含 N 名参赛 UTR 未裁决的队员，按较大值计算`，用 warning 档。推导值的数字旁 SHALL 逐字标注 `估算`；整套候选上 SHALL 逐字呈现 `含 N 个估算值，合法性待总表确认`。可达上限由含估算值的阵容达成时，上限旁 SHALL 标注 `含估算值`。收到纯数字旧 key 时页面 MUST 逐字呈现 `这个链接是旧格式（队员编号已变），请重新选择锁定的搭档`，并 SHALL 让人不手工改 URL 就能继续；MUST NOT 静默忽略旧 key 后照常出结果。
- **Runtime**: `cd frontend && npm run test -- lineup` → expected: 全部通过；token 断言经 `wrapper.classes()` 命中对应色档
- **Code**:
  - 旧链接失效用**中性**档，不是 danger——它是提示，不是危险操作。
  - 顶部现在可能同时出现四类提示（未裁决 / 未参与计算 / 截断 / 外援未校验），候选卡上还有估算。若变成提示墙，那是信息结构该收拢的信号；本次不预先设计，在 VISUAL DIFF 拿真实数据判断。
  - 锁定与排除仍完全由 URL 表达，MUST NOT 把选择只存在客户端状态里。
- **Threshold**: 70
