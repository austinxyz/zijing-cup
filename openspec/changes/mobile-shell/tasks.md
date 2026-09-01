## 1. 地基：UTR 网址常量、两个 token 的对比度、管理界面两处链接

本组全是桌面可见的改动，没有窄视口版式，因此不做 VISUAL DIFF。

### Contract
- **Spec**:
  - 「网址 SHALL 由单一常量拼出（`https://app.utrsports.net/profiles/<id>`），MUST NOT 在多处各写一份字面量。外链 SHALL 带 `rel="noopener noreferrer"`。」（team-roster-ui）
  - 「队员列表与队员详情页在 `utr_profile_id` 有值时 SHALL 把它呈现为指向该队员 UTR 官网档案页的链接，MUST NOT 只呈现为不可点的文字或一个「有 / 无」的指示。」（player-admin-ui）
  - 「`utr_profile_id` 为空时列表 SHALL 仍然呈现「无」（它是将来合并的唯一依据，缺失必须可见），但 MUST NOT 呈现为链接或错误。」（player-admin-ui）
  - 「文本 token 与它实际所处容器底色的对比度 SHALL 不低于 4.5:1。判定依据 MUST 是**合成之后的实际颜色**：叠加了不透明度的文本，按合成结果参与判定，MUST NOT 按 token 的原始值判定。」（app-shell）
- **Runtime**: `cd frontend && npx vitest run lib/ app/[season]/[division]/players/` → expected: 新增的 `profileUrl` 用例与两处链接用例全绿，无既有用例转红
- **Code**:
  - D7：`profileUrl(id)` 是纯函数 + 唯一一处字面量；`id` 为空时**调用方不调用它**，不让函数返回空串或 `#` —— 那会造出点不动的链接。
  - D8：只改 `--color-muted` → #6b665d 与 `--color-sidebar-fg-dim` → #8f8a7e，不新增 token；`PendingNavItem` 的 `opacity-45` **删掉**，禁用态改用颜色表达 —— 不透明度会让最终对比度在源码里读不出来。
  - `--color-muted` 变深波及桌面 ~76 处，只变颜色不变布局。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/mobile-shell/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — vitest: `profileUrl("abc123")` 返回 `https://app.utrsports.net/profiles/abc123`；并断言 `frontend/` 源码中该网址字面量只出现一处（grep 断言，排除测试文件）
- [ ] 1.2 GREEN — 新建 `frontend/lib/utr.ts`，实现 `profileUrl`
- [ ] 1.3 RED — vitest（`players/[id]/page.test.tsx`）：`utr_profile_id` 有值时，详情页渲染出 `href` 指向该 profile 的 `<a>` 且带 `rel="noopener noreferrer"`；为空时该处不是 `<a>`
- [ ] 1.4 GREEN — 改 `players/[id]/page.tsx`：把 `…/profiles/{id}` 的纯文字换成链接，空值保持「未填」纯文本
- [ ] 1.5 RED — vitest（`players/PlayerTable.test.tsx`）：某行 `utr_profile_id` 有值时「有」是链接；为空时仍显示「无」且不是链接、不带错误样式
- [ ] 1.6 GREEN — 改 `players/PlayerTable.tsx`
- [ ] 1.7 RED — vitest：`Sidebar` 的未开放导航项**不带任何降低不透明度的类**（断言 `wrapper.classes()` 不匹配 `/opacity-/`），且用 `text-sidebar-foreground-dim`
- [ ] 1.8 GREEN — 改 `frontend/app/globals.css` 的 `--color-muted` 与 `--color-sidebar-fg-dim` 两个值；删掉 `Sidebar.tsx` 的 `PendingNavItem` 上那个 `opacity-45`
- [ ] 1.9 实测对比度 — 起 dev stack，用 computed style 逐节点量桌面四条读路由 + 队员管理两页：报告低于 4.5:1 的节点数应为 0；把改前/改后的数字记进 eval-log.md（改前已知：表头 4.09、侧栏未开放项合成后 1.63）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 应用壳的窄视口版式：顶栏 + tab 条 + 高度模型

### Contract
- **Spec**:
  - 「**窄视口（< 768px）下侧栏 SHALL 变形为顶栏加一条 tab 导航**，而不是保持固定宽度的纵向侧栏。变形只改呈现，导航语义不变。」（app-shell）
  - 「窄视口的 tab 条 SHALL 只列「队伍」「阵容」「对手对比」「赛制规则」四项，**MUST NOT 列出「队员管理」**。」（app-shell）
  - 「窄视口下 tab 与其他主要可点区域的可点高度 SHALL 不小于 44px。」（app-shell）
  - 「应用壳在窄视口下 SHALL 保证任何可能变长的内容都落在一个真实的滚动容器内。壳 MUST NOT 依赖一个按 `100vh` 计算的高度……MUST NOT 施加一个大于窄视口可视高度的最小高度。」（app-shell）
  - 「内容超出可视区时 MUST 出现滚动条或可滚动反馈，MUST NOT 被静默裁切。」（app-shell）
  - 「滚动容器 MUST 位于顶栏与 tab 条**之下**的那一层。」（app-shell）
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/` → expected: 新增的 TopNav / 高度模型用例全绿，既有 Sidebar 与 layout 用例不转红
- **Code**:
  - D4：一份 nav 数据源 + 两个呈现组件（`Sidebar` / `TopNav`），不在一个组件里塞两套 DOM。tab 少一项是**消费侧的显式过滤**，不是数据源里恰好没列。
  - D3：三处一起改才成立 —— `100dvh`（保留 `100vh` 作前一条声明作回退）、窄视口不施加 `min-h-[640px]`、滚动容器放在顶栏与 tab 之下那一层。给顶栏加 `flex-none` 钉不住它。
  - D2：隐藏用 `display:none`（Tailwind `hidden`），不用 `visibility`/`opacity` —— 隐藏的一侧必须从无障碍树里消失，否则读屏会念到两份导航。
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/mobile-shell/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 MOCK — 打开 `docs/superpowers/specs/mocks/2026-08-31-mobile-shell-mocks.html#teams-list` 与 `#season-switcher`；记下顶栏用的是 `--color-sidebar-*` / `--color-sidebar-well`（不是内容区 token）、tab 高 44px、四项 tab 的逐字文案（队伍 / 阵容 / 对手 + 「未开放」/ 规则）
- [ ] 2.2 RED — vitest：抽出的 nav 数据源导出五项（含队员管理），而 `TopNav` 渲染出的项恰为四项且**不含**「队员管理」；断言 `wrapper.classes()` 含 `bg-sidebar` 一类的 token 类而非硬编码颜色
- [ ] 2.3 GREEN — 抽 `navItems` 数据源；新建 `TopNav`（顶栏 + tab 条 + 赛季切换器），`Sidebar` 改为消费同一份数据源
- [ ] 2.4 RED — vitest：`TopNav` 的当前区段选中态由 `useSelectedLayoutSegment()` 推导（在球队名单路由下「队伍」为选中态）；「对手对比」是禁用态且**不是** `<a>`；每个 tab 的类里含 `h-11` 或等价的 ≥44px 高度
- [ ] 2.5 GREEN — 实现选中态与禁用态
- [ ] 2.6 RED — vitest（`layout.test.tsx`）：壳的类中不含 `min-h-[640px]` 在窄视口生效的形式；含 `dvh` 形式的高度；滚动容器不是顶栏的祖先
- [ ] 2.7 GREEN — 改 `[season]/[division]/layout.tsx` 的高度模型与断点分支（窄视口纵向堆叠、宽视口保持左右分栏）
- [ ] 2.8 VISUAL DIFF — 起 dev stack（`npm run dev --prefix frontend`），把视口设为 **375×667**，逐条访问 `/2025/silver/rules`、`/teams`、`/lineup`；对照 `#teams-list` 与 `#rules` 两屏；**同时用脚本量**：文档无横向溢出、顶栏在滚动后仍可见、tab 高度 ≥44px、对比度 0 个不合格。宽视口（≥768px）回看一遍确认桌面未变形
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 球队两屏与窄视口名单行（含名单页的 UTR 链接）

### Contract
- **Spec**:
  - 「窄视口（< 768px）下，球队列表与某支球队的名单 SHALL 各占一屏，MUST NOT 并排。从名单 SHALL 有一个返回球队列表的入口。」（team-roster-ui）
  - 「两屏 SHALL 由同一套路由承载，由视口宽度决定哪一侧可见。实现 MUST NOT 依据 user-agent 判定设备。」（team-roster-ui）
  - 「**窄视口（< 768px）下不存在「未选球队」这个中间态**……窄视口下访问球队列表页 SHALL 直接呈现球队列表。」（team-roster-ui）
  - 「窄视口（< 768px）下名单 SHALL 呈现为逐行的列表而非表格，每行给出序号、姓名、性别、参赛 UTR 与 UTR 来源。参赛 UTR……在行内 SHALL 是最显著的数字。」（team-roster-ui）
  - 「**窄视口（< 768px）下这两列不呈现。**」（当前单打 / 当前双打，team-roster-ui）
  - 「名单页 SHALL 为填有 `utr_profile_id` 的队员提供一个指向该队员 UTR 官网档案页的链接……为空时 MUST NOT 渲染链接，也 MUST NOT 渲染一个点不动的链接外壳或错误提示。」（team-roster-ui）
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/teams/` → expected: 两屏切换、窄视口名单行、UTR 链接三组用例全绿；既有名单表用例不转红
- **Code**:
  - D2：同一套路由 + CSS 决定可见性，由当前 segment 判断哪一侧在窄视口显示（segment 已在 `SelectedTeamList` 里读了，不新增机制）。**不得**出现按 user-agent 的分支。
  - D5：名单是两套 DOM，不是把 `<table>` 用 CSS 打散 —— 后者会毁掉表格语义且做不到隐藏两列 + 来源换行。判定逻辑（来源标签文案、是否可链接、排序）抽成共用纯函数，两套 DOM 只负责排版。
  - 参赛 UTR 为 null 的队员**仍要占一行**，写「无参赛 UTR」，不是 0（0 是合法 UTR）也不是跳过 —— 跳过会让球队列的人数与名单条数对不上而页面不说。
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/mobile-shell/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — 打开 `#teams-list` 与 `#roster`；记下球队行 52px / 名单行两层结构（主行 序号·姓名+性别·参赛UTR，副行 来源标签）、返回条「‹ 球队列表」的逐字文案、有链接的姓名带下划线而无链接的是纯文字
- [ ] 3.2 RED — vitest：窄视口分支下 `teams/` 索引路由不渲染「从左侧选一支球队」文案；宽视口分支下仍渲染
- [ ] 3.3 GREEN — 改 `teams/layout.tsx` 与索引页：按 segment + 断点决定球队列与内容区各自的可见性（`hidden` / `md:flex`）
- [ ] 3.4 RED — vitest：窄视口名单渲染出逐行列表（非 `<table>`），行内含参赛 UTR 与来源标签，**不含**当前单打/当前双打；`match_utr` 为 null 的队员仍有一行且文案为「无参赛 UTR」
- [ ] 3.5 GREEN — 抽共用的「一名队员的展示数据」纯函数；实现窄视口名单列表 DOM
- [ ] 3.6 RED — vitest：`utr_profile_id` 有值时姓名是 `<a>` 且 `href` 由 `profileUrl` 给出、带 `rel="noopener noreferrer"`；为空时姓名是纯文本且页面无额外提示
- [ ] 3.7 GREEN — 名单页姓名接上 `profileUrl`（宽窄两套 DOM 都接）
- [ ] 3.8 VISUAL DIFF — dev stack，视口 375×667，访问 `/2025/silver/teams` 与人数最多的那支队（**SJTU 26 人**）；对照 `#teams-list` 与 `#roster`；量：18 队与 26 人两屏都有真实滚动容器（`scrollHeight > clientHeight`）、能滚到最后一行、顶栏不跟着卷走、无横向溢出、对比度 0 不合格。宽视口回看确认桌面名单表 7 列未变
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 窄视口下的行内编辑抽屉

### Contract
- **Spec**:
  - 「窄视口（< 768px）下，已登录的管理员 SHALL 仍能就地修改一名队员的当前单打 / 双打 UTR。功能与宽视口是同一条路径；呈现形态可以不同。」（team-roster-ui）
  - 「窄视口的编辑入口 SHALL 遵循与宽视口相同的两条既有约束：未登录时不出现任何编辑入口；输入框只填数值，状态默认已认证。可点区域高度 SHALL 不小于 44px。」（team-roster-ui）
  - 「赛季未锁时写入当前双打 UTR 会同时覆盖该赛季的参赛 UTR，窄视口的编辑界面 SHALL 同样把这件事说出来。」（team-roster-ui）
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/teams/[code]/` → expected: 抽屉的开合、未登录不出现入口、赛季未锁时的说明三组用例全绿
- **Code**:
  - 写接口自己会拒绝没有管理员凭据的请求；`canEdit` 只决定要不要给一个按不动的按钮，**不是防护**。
  - 「赛季未锁时一并覆盖参赛 UTR」是既定设计（`current-utr-io` D9），护栏只有赛季锁 —— 界面必须说出来，否则一次手填会无声覆盖组委会的冻结值。
  - 状态默认 `rated`，只填数值那个框即可保存。
  - 输入框高度 ≥44px（触摸目标）。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/mobile-shell/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 MOCK — 打开 `#inline-edit`；记下抽屉的三块（当前双打 + 状态分段控件、当前单打、赛季未锁的说明）、输入框 44px、按钮 42px、说明的逐字文案
- [ ] 4.2 RED — vitest：已登录时窄视口名单行有编辑入口且可点高度 ≥44px；未登录时整页无任何编辑入口
- [ ] 4.3 GREEN — 实现窄视口的编辑抽屉与入口
- [ ] 4.4 RED — vitest：赛季未锁时抽屉内呈现「保存会把该赛季的参赛 UTR 一并改成同一个值」这一说明；赛季已锁时不呈现该说明
- [ ] 4.5 GREEN — 接上赛季锁状态并渲染说明
- [ ] 4.6 VISUAL DIFF — dev stack，375×667，以管理员身份打开一支队的名单并点开某一行；对照 `#inline-edit`；量输入框与按钮高度、抽屉内可滚动、对比度 0 不合格
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 排阵页的窄视口版式

### Contract
- **Spec**:
  - 「窄视口（< 768px）下排阵页 SHALL 以候选阵容为首屏内容，锁定与排除的控件 SHALL 收进一个可展开、可关闭的面板。关闭面板 SHALL 回到结果，MUST NOT 离开当前页面。」（lineup-ui）
  - 「面板内的约束列表可能比一屏长（一支队最多 26 人），因此面板 SHALL 自带滚动容器。」（lineup-ui）
  - 「面板关闭时，页面 SHALL 呈现当前生效的锁定与排除的摘要，且摘要 SHALL 点名到具体队员，MUST NOT 只给数量。」（lineup-ui）
  - 「无任何约束时，摘要 SHALL 说明当前没有约束，MUST NOT 什么都不显示。」（lineup-ui）
  - 「窄视口下，在面板内增删约束 SHALL NOT 自行触发一次新的搜索；面板 SHALL 提供一个显式的重新搜索操作。」（lineup-ui）
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/` → expected: 面板开合、摘要点名、无约束时的文案、不自动搜索四组用例全绿；既有 `LineupControls` 与结果用例不转红
- **Code**:
  - D6：面板开合是**纯本地 UI 状态**，不进 URL —— 约束本身已完全由 URL 表达，把开合塞进 URL 会让同一份结果有两个链接。
  - 面板内仍是既有的 plain GET form（`LineupControls.tsx:75`），提交即导航 —— 与桌面同一段代码，不引入行为分叉。
  - 摘要点名到人的理由要落到实现上：一份受约束的结果与无约束最优解在屏幕上长得一样；只给数量仍需展开面板才能判断该不该信这份结果。
- **Threshold**: 70

- [ ] 5.0 CONTRACT — write openspec/changes/mobile-shell/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — 打开 `#lineup-results` 与 `#lineup-constraints`；记下摘要条的形态（「已锁 陈嘉禾+吴普强 · 排除 1 人」+「改约束」）、抽屉最高 78% 且上方留缝、按钮 42px、「重新搜索」是主操作
- [ ] 5.2 RED — vitest：窄视口下首屏渲染候选阵容而控件不在首屏；点开/关闭面板后地址未变
- [ ] 5.3 GREEN — 实现窄视口的结果打底 + 约束抽屉（`LineupControls` 复用，外面套抽屉）
- [ ] 5.4 RED — vitest：有锁定时摘要含两名队员姓名；有排除时含被排除者姓名；无任何约束时摘要逐字说明当前没有约束
- [ ] 5.5 GREEN — 实现约束摘要
- [ ] 5.6 RED — vitest：在面板内增删一个约束不发出搜索请求（不触发导航），点「重新搜索」才提交
- [ ] 5.7 GREEN — 确认面板内是既有 GET form 且无 onChange 自动提交
- [ ] 5.8 VISUAL DIFF — dev stack，375×667，打开一支 26 人球队的排阵页（带一个锁定与一个排除）；对照 `#lineup-results` 与 `#lineup-constraints`；量抽屉内可滚动、按钮高度、摘要在关闭态可见、对比度 0 不合格。宽视口回看确认桌面两栏未变
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 验证与交付

- [ ] 6.1 跑后端测试 —— `cd backend && uv run pytest`（本机若被 Application Control 拦，改走 `backend/.venv-std/Scripts/python.exe -m pytest`）。本次不动后端，这一步是确认没有连带损伤
- [ ] 6.2 跑前端测试 —— `cd frontend && npm run test`
- [ ] 6.3 类型检查 —— `cd frontend && npx tsc --noEmit`。**vitest 走 esbuild 只转译不校验类型**，测试全绿不等于构建能过；这条单列
- [ ] 6.4 **补种再看页面**：跑完 pytest 本地库是空的（fixture 会 TRUNCATE 规则表与名单表）。顺序写死 —— 先跑测试 → `bash backend/scripts/reseed-local.sh` → 再做任何视觉核对，中途不插测试
- [ ] 6.5 全站对比度终检 —— 窄视口（375×667）与宽视口各跑一遍 computed-style 扫描，报告低于 4.5:1 的节点数应为 0；与视觉稿的基线（370 个叶子节点、最低 4.69）对齐后记进 eval-log.md
- [ ] 6.6 桌面回归核对 —— 逐屏比对四条读路由 + 队员管理两页：布局（行高、列数、列宽）与改动前一致，差别只有两个 token 的颜色与三处新增链接
- [ ] 6.7 Run superpowers:verification-before-completion —— 跑 `openspec/config.yaml` 的 `test_commands` 与全部 `custom_verification_checks`（含真实球员数据扫描、凭据泄漏扫描、migration schema 守卫）
- [ ] 6.8 `openspec validate mobile-shell` 通过；`openspec status --change mobile-shell` 全部 done
