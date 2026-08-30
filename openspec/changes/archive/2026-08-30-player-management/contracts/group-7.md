# Contract — Group 7: 队员列表与详情

### Contract
- **Spec**:
  - 队员列表 SHALL 呈现姓名、性别、当前单双打 UTR 与状态、参赛 UTR（含赛季与状态）、
    所在的全部队伍、以及 UTR 链接是否已填。一名队员同时属于多支队伍时 SHALL 全部列出。
  - `未裁决` 与 `预填` SHALL 用同一档警示样式标出。缺少 UTR 链接 SHALL 可见但 MUST NOT
    呈现为错误。
  - 队员详情页 SHALL 在同一屏内呈现基本信息、各赛季参赛 UTR、以及队伍成员关系；
    SHALL 说明外援与外卡的区别，并说明外援限制未被系统校验。
  - 呈现未裁决时，页面 SHALL 说明当前按较大值参与计算，并给出两个候选值。
- **Runtime**: `cd frontend && npm run test -- app/players` → expected: 全部通过，含一人多队全部列出、未裁决与预填带同档警示、详情三块同屏、未裁决横幅写明当前采用值
- **Code**:
  - 长列表要自带滚动容器，滚动放内层、表头留在外面（壳是 `h-screen overflow-hidden`，
    见 CLAUDE.md Pitfalls）。
  - 本 change 落地后到读路径切换之前，管理界面的修改在名单页与排阵页上看不见——界面上要
    说明这一点，不能让人以为前台坏了（Risks 第一条）。
  - 取数经 `frontend/lib/api.ts` 单一出口；客户端 bundle 不含后端地址与密钥。
- **Threshold**: 70
- **Note**: 含 VISUAL DIFF 任务，阈值取 70
