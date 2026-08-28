---
Date: 2026-08-28
Change: roster-display
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# roster-display Requirements

把已经落库的名单变成队长能在浏览器里翻的页面。后端两条只读端点在
`team-roster` 里已经上线并跑通远程数据（金组 6 队 120 人、银组 18 队 339 人）；
本次做的是前端，外加一处后端小改动：球队的可选中文名。

这是队长在赛前真正会反复打开的那一页——看自己队有谁、UTR 多少、哪几个人的
评级还没定，以及对手队的同样信息。排阵推荐不在本次范围内（`lineup-engine`），
本页只回答「名单上有谁」。

## Goals

- `/[season]/[division]/teams` 与 `/[season]/[division]/teams/[code]` 两条路由，
  左侧球队列常驻，右侧是选中队的名单。侧栏「队伍」从禁用态变成真链接。
- 球队列每行显示 `code` + 总人数 + 男/女人数，按 `code` 字母序排列（稳定、可预期，
  与后端 `list_teams` 现有的 `order_by(Team.code)` 一致）。女队员人数是硬约束——混双要 1 名、
  女双要 2 名，场上至少 3 名——所以它比平均 UTR 更该占据这个位置。
  2025 数据里金组 `JNU-UCLA` 恰好只有 3 名女队员（卡在下限），银组
  `SJSU` / `SJTU-XJTU` / `BUAA-UMN-UCB` 各 4 名，这类「一人退赛就凑不出
  阵容」的队要一眼可见。
- 名单表按参赛 UTR 降序，同值时按姓氏排（沿用后端 `get_team_roster` 已有的
  `match_utr desc, last_name` 次序，前端不再自行排序——两处各排一次就会分歧）。
  列出姓名、性别、参赛 UTR、UTR 来源。
- 「UTR 来源」同时给出我们的判断与总表原文：已认证 / 委员会审定 / **待定**，
  旁边灰字附 `dutr_status` 原文（`Rated` / `Projected` / `Unrated` /
  `Unrated / Appeal` 等）。`rating_class` 为 NULL 的 36 行显示「待定」。
- 球队可以有一个人工维护的中文名，走 seed 文件 + 导入命令，与赛制规则同一套模式。
  界面上以 `code` 为主标题，有中文名的在下方补一行灰字。**seed 只列有名字的球队**，
  其余留空——三校联队（`USTC-CMU-HQU`、`SCUT-HSFZ-GSU`）没有自然的中文叫法，
  强求每支队都有名字只会逼出难看的硬凑。单校队与 `THU-I` / `THU-II`
  （清华一队 / 二队）则都好起名。
- 桌面版式对照 `design/Teams.dc.html` 与 `design/TeamsEmpty.dc.html`。
  **移动端不在本次范围**，理由见 Non-Goals。

## Non-Goals

- **不做「当前 UTR」。** 库里只有赛前冻结的参赛 UTR 与 9/21–9/25 五日取样，
  没有任何实时数据源。要显示当前 UTR 得对接 UTR 官网取数（认证、球员与 UTR
  档案的对应关系、缓存、失败降级），那是一个独立能力，不是本次塞得下的。
  设计稿里那个「参赛 UTR / 当前 UTR」切换器同理不做。
- **不做界面编辑。** 球队中文名只能改 seed 文件。界面上直接改需要先解决认证——
  本项目没有 per-user 登录，一个公开写端点等于谁都能覆盖所有队的数据，而
  CLAUDE.md 明确记着认证是「要重新设计的点，不要在现有共享密钥模型上打补丁」。
  另开一个 change 处理。
- **不做外援标记的展示与录入。** 字段在库里、全是 NULL，本次不显示这一列。
  代价明确：`lineup-engine` 需要它来查外援人数上限，到时候会被它卡住。
- **不做阵容推荐。** 设计稿 `design/Main.dc.html` 下半截的「各线最优搭档」属于
  `lineup-engine`，本次只取上半截。
- **不展示五日取样明细。** `daily_utrs` 在库里，但银组 39 人的取样格是
  `Early Lock` 文字注记、值本身缺失，展开会是一片空洞的表格。
- **不做移动端版式。** 2026-08-28 核对时量到：`/2025/silver/rules` 在 375px 下
  仍保持 216px 侧栏、把内容压到 159px —— 应用壳从来没有实现过移动端，
  `RulesMobile.dc.html` 画了但没建。窄屏版式的主体是壳（侧栏收成顶栏、导航变
  tab 条），属于 `app-shell`，且会同时改变已上线的规则页。放进本次等于让
  「加一个页面」顺带承担整个壳的响应式改造。手机稿
  `design/TeamsMobile.dc.html` 与 `TeamsMobileRoster.dc.html` 保留，
  作为后续 `mobile-shell` change 的输入。
- 不做搜索、筛选、排序切换。18 支队、单队最多 26 人，一屏能看完。
- 不做跨队比较视图。

## Constraints

- 浏览器只与 Next.js 通信；取数一律经 `frontend/lib/api.ts` 单一出口，在
  Server Component 内完成。`BACKEND_URL` / `BACKEND_SECRET` 不得进客户端 bundle。
- URL 是选中球队的唯一事实来源。选中项不得存在 React state 里——那会与地址栏
  分歧，且刷新与分享链接都会丢。这条在 `app-shell` 的切换器上已经踩过一次。
- 页面壳（侧栏）在 layout 里，不在页面内部。一次取数失败只能替换内容区，
  不能清空整个窗口。
- 新增的球队中文名字段是**人维护、CSV 不拥有**的，与 `is_borrowed_player`
  同类。名单导入器不得触碰它——`SOURCE_FIELDS` 那套字段归属纪律照旧。
- Render 免费版闲置后休眠，冷启动接近 1 分钟。页面要有 loading 态，
  取数超时不能是白屏。
- 球队中文名需要给 `zijing_cup.teams` 加一列，即一个新 migration。按 CLAUDE.md 的
  规则，**远程共享项目禁止跑 `supabase db push` / `migration repair`**，必须去
  Supabase Dashboard 的 SQL Editor 手工执行——上线步骤里要显式包含这一步，
  否则前端上线后球队中文名整列查不到。
- 设计 token 沿用 `frontend/app/globals.css` 与 `components/ui/`，
  不新增运行时依赖。
- 名单含真实校友姓名与 UTR：截图、mock、测试 fixture 一律用虚构姓名。

## Success Criteria

- 侧栏「队伍」是链接，指向当前赛季组别的 `/teams`；「分析」仍为禁用态。
- `/2025/silver/teams` 渲染 18 支球队，`/2025/gold/teams` 渲染 6 支，
  人数合计分别为 339 与 120。
- 球队列每行的「男 + 女 + 性别未填」等于该行总人数。2025 全部 459 行都有性别，
  所以第三档现在恒为 0 且不显示；但 `gender` 可空，一旦出现空值必须单列一档，
  不能并进男或女——那会让某一侧的人数凭空多出一个人。
- `/2025/silver/teams` 未选队时右侧是空状态提示，不是空白、不是自动跳转。
- `/2025/silver/teams/PKU` 列出该队 19 人，按参赛 UTR 降序。
- 某位 `dutr_status` 为 `Unrated` 的球员，其 UTR 来源显示「待定」，
  **不显示**「自评」或任何具体类别——那是待组委会澄清的事项，
  页面替它下结论就等于决定了谁占用「场上至多 2 名自评级」的名额。
- 未知球队 code 返回 404，不是空名单——空名单读作「这支队没有球员」，是另一句话。
- 后端不可达时侧栏与球队列仍在，只有内容区变错误态。
- 客户端 bundle 中不含 `BACKEND_URL` / `BACKEND_SECRET`。
- 桌面 1440px 下与 `design/Teams.dc.html` / `TeamsEmpty.dc.html` 的 token、
  配色与逐字文案一致，页面不横向溢出。

## User Stories

- 作为队长，我想打开一页就看到本组所有球队和各队人数，不必回到 Google Sheet 里
  数行数；也想立刻看出哪几支队女队员卡在下限，因为那决定了他们能不能填满五条线。
- 作为队长，我想点开一支队看到完整名单和每个人的参赛 UTR，按强弱排好，
  这样我能在心里估出对手的前几条线。
- 作为队长，我想知道哪些队员的评级类别还没定——那是需要人工判定的待办，
  而不是可以当成已知条件用的数字。
- 作为赛事组织者，我想给球队起一个比 `USTC-CMU-HQU` 更好念的中文名，
  而且改名之后不会在下次导入名单时被覆盖掉。

## Open Questions

留到视觉稿阶段（Phase 4）看实际观感再定，不阻塞需求定稿：

- 18 行球队列在桌面端一屏放不放得下，放不下时是滚动还是缩行高。
- 空状态那句提示的具体措辞。
- 「待定」标签用哪一档颜色。它不是错误（用 danger 是错的），也不是纯中性——
  它是一件待办。`app-shell` 里为「合法但有代价」加过 `warning` 档，可能适用。

以下三条在 Phase 1 已经定了，记在这里免得后续阶段重新讨论：

- **seed 只列有中文名的球队**，其余界面上只显示 code。
- **五日取样（`daily_utrs`）本次不露出**。要露出得先处理银组 39 人的取样是
  `Early Lock` 文字注记、值本身缺失的情况，收益不抵成本。
- **球队列按 code 字母序**。

## Referenced Capabilities

- `team-roster`（已实现）—— 两条只读端点与数据模型。
  本次新增的球队中文名会扩展它的 `teams` 表与 `TeamSummaryOut`。
- `app-shell`（已实现）—— 侧栏、赛季×组别切换器、设计 token 与基础组件。
  本次要把「队伍」从 `PendingNavItem` 改成真链接。
- `competition-rules`（已实现）—— 不直接依赖，但页面上的「参赛 UTR」概念
  与规则页的 cap 是同一套口径，措辞要一致。
- `lineup-engine`（规划中）—— 消费本页展示的同一批数据。
  本次刻意不做的阵容推荐属于它。

## Design System

不重新选型。沿用 `app-shell` 已定的那一套——`frontend/app/globals.css` 的 token 块
与 `components/ui/{button,card,badge,input}`，逐值移植自 ai-course-management。

Phase 4 的 awesome-design-md 选型步骤在本项目是空转：规则页已经用这套上线了，
此时另选一套等于让「队伍」页与「赛制规则」页长得不像同一个应用，而两页就在同一个
侧栏下相邻。视觉稿直接在现有 token 上画。
