---
Date: 2026-08-27
Change: rules-and-design-system
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# rules-and-design-system Requirements

第一个纵向切片：把 ai-course-management 的设计系统移植进来，建立 `(season, division)`
赛制规则数据模型，并用一个「赛制规则」页面把规则从 Supabase 读到浏览器 —— 一次性验证
`Next.js → FastAPI → Supabase(zijing_cup)` 的完整链路承载真实数据。

领域规则的完整依据见 [docs/domain/rules.md](../../domain/rules.md)。
界面依据见 `design/` 下的设计稿画板（队伍页 / 分析页 · 银组 / 分析页 · 金组）。

## Goals

- 把设计系统移植到 `frontend/`：`globals.css` 的 token 块、`lib/cn.ts`、
  Button / Card / Badge / Input 四个基础组件、layout 里的 Noto Sans SC + JetBrains Mono。
  零新增依赖（`cn` 是手写的，不依赖 clsx/tailwind-merge）。
- 建立应用壳：216px 深色侧栏（队伍 / 分析 / 赛制规则导航 + 赛季×组别切换器），
  后续每个页面都复用它。切换器是**一个合并控件**（形如「2026 · 银组」），一次选定
  赛季与组别，不是两个独立下拉。本次只有「赛制规则」是真页面，队伍与分析两个导航项
  呈现为**禁用态并标注未开放** —— 不做成可点击但跳到空页的死键。
- 建立 `(season, division)` 赛制规则数据模型，能同时表达金组与银组、且能表达
  规则的逐年变化。所有 cap / buffer / 分值 / 资格阈值都是数据，不是代码常量。
- 规则内容以 TOML seed 文件为唯一事实来源，配一条幂等的导入命令，并提供
  `--check` 模式供 CI 检测「文件改了但没导入」的漂移。
- seed 2025 与 2026 两个赛季 × 金/银两个组别，共四套规则。
- 「赛制规则」页面按赛季×组别展示该组别的完整规则；切换组别时页面呈现的规则
  语义随之改变（金组出现开放线与分值，银组是五线均有 cap）。

## Non-Goals

- 球队、球员、名单、参赛 UTR —— 属于后续的 `roster-import` change。
- 阵容合法性校验与阵容搜索的**实现** —— 属于 `lineup-engine` change。
  本次只把校验所依据的规则存进去，不计算任何阵容。
- 规则的编辑界面。规则改动走 seed 文件 + code review + 导入命令。
- 队伍页、分析页的实现。本次只交付它们共用的壳。
- 用户登录与 per-user 权限（与项目既有决策一致，本项目不做）。
- 「田忌赛马」判定方式的定义（见 Open Questions 与 docs/domain/rules.md 的「待澄清」）。
- 金组 4:4 平局的三级抢先**计算**。规则里记下判定顺序即可，净胜局需要真实比分，
  排阵阶段拿不到。

## Constraints

- 架构铁律不变：浏览器只连 Next.js；Next.js 经 `lib/api.ts` 单一出口调 FastAPI；
  只有 FastAPI 碰数据库。`BACKEND_URL` / `BACKEND_SECRET` / `DATABASE_URL`
  禁止带 `NEXT_PUBLIC_` 前缀。
- 所有表建在 `zijing_cup` schema，migration 写 schema-qualified DDL 或以
  `set search_path to zijing_cup, public;` 开头。本 Supabase 项目与
  ai-course-management 共用，`public` 是对方的。
- migration 是 schema 变更的唯一来源，禁用 Alembic。
- seed 文件用 TOML，以 Python 3.11+ 标准库 `tomllib` 读取 —— 不新增依赖，
  且支持注释，每条规则旁可贴规则原文出处。
- 前端不新增运行时依赖。
- 赛季与组别通过 URL 路径段表达（`/2026/silver/rules`），不放 cookie 或
  query string；URL 用 `gold` / `silver`，界面显示「金组」/「银组」。
- 规则数据对外只读：**不提供任何 HTTP 写入端点**，唯一的写入者是后端进程内直连
  数据库的导入命令。因此无需额外鉴权层（后端整体仍在 `X-Backend-Secret` 中间件之后）。

## Success Criteria

- `supabase/migrations/` 新增的 migration 在干净库上执行后，规则相关的表全部存在于
  `zijing_cup` schema，且 `public` schema 未被写入任何对象。（具体分几张表由设计阶段
  决定，本文档只约束它能表达下列事实。）
- 导入命令在空库上执行后，四套规则（2025/2026 × 金/银）落库；**重复执行结果一致**
  （幂等）。
- 导入命令的 `--check` 模式：DB 与 seed 文件一致时退出码 0；人为改动 seed 文件后
  退出码非 0，并指出差异所在。
- 数据模型能无损表达两组的真实差异，可由查询直接验证：
  - 银组 2026 五线 cap 为 13 / 12 / 11 / 10.25 / 9.25，buffer 0.5
  - 金组 2026 的 D1 与 MD `cap IS NULL`（开放线），D2 / D3 / WD 为 15 / 13 / 11，buffer 0.3
  - 金组五线分值为 1 / 2 / 2 / 1 / 2，银组按场次计胜负
  - 银组 2025 的 MD / WD cap 为 10.5 / 9.5 且无 buffer —— 证明规则确实按赛季存
  - 金组的资格限制能表达「UTR>9.0 男 ≤1 名且只能打 D1/MD」这条同时带人数上限与
    线位白名单的规则
- `GET /api/seasons/{year}/divisions/{code}/rules` 返回该组别的完整规则；
  未知赛季或组别返回 404 而非空对象。
- 访问 `/2026/silver/rules` 与 `/2026/gold/rules` 呈现各自规则；金组页面显示
  开放线与分值，银组页面显示五线 cap。两个页面均由 Server Component 取数。
- 后端不可达时「赛制规则」页面呈现错误态而非崩溃或空白壳。
- 前端构建产物中不含 `BACKEND_URL` / `BACKEND_SECRET` / `DATABASE_URL`
  （沿用 `openspec/config.yaml` 里既有的 grep 校验）。
- 后端测试覆盖：导入命令的幂等性与 `--check` 漂移检测、规则查询端点的
  200 与 404 路径。前端测试覆盖：规则页面的渲染、切换器的链接目标、后端不可达的错误态。

## User Stories

- 作为队长，我想按赛季和组别查到本组的完整赛制规则（各线 cap、buffer、分值、
  资格限制），这样排阵前不必翻公众号长文去找那几个数字。
- 作为队长，我想看到去年的规则，这样当今年的 cap 变了（银组混双 10.5→10.25）
  我能立刻知道去年那套阵容今年是否还合法。
- 作为开发者，我想让 cap / buffer / 分值 / 资格阈值以数据形式存在，这样明年规则
  调整时改的是一个 seed 文件，而不是散落在排阵算法里的常量。
- 作为开发者，我想要一条 `--check` 命令，这样「seed 文件改了但忘了导入」会在 CI
  被拦住，而不是等到排阵算错才发现。
- 作为开发者，我想让后续页面直接复用已定型的侧栏壳与基础组件，而不必在每个
  change 里重新决定布局与配色。

## Open Questions

本次无未决问题 —— 以下三项曾被提出，均已就本次范围作出决策，真正待澄清的领域歧义
已转记到 [docs/domain/rules.md](../../domain/rules.md) 的「待澄清」一节，以免随本文档归档而丢失。

- 「三线男双不能田忌赛马」的判定方式：规则原文未给数值定义。**本次决策**：只存
  `mens_doubles_must_be_ordered` 开关，不定义比较方式（见 Non-Goals）。比较方式需向
  组委会确认，由 `lineup-engine` 落地。
- 金组 4:4 平的三级抢先：第一级「净胜局百分比」需要真实比分，排阵阶段拿不到。
  **本次决策**：规则表记录判定顺序，界面呈现方式留到分析页的 change。
- 2026 各组实际报名队数未知。**本次决策**：规则模型不依赖队数，与本次无关，
  由 `roster-import` 填。

## Referenced Capabilities

本次有意跨两个 capability：规则页需要一个落脚的壳，若拆开，规则页会先长在一个
随后就要推翻的布局里。

- `ADD competition-rules` —— 赛季×组别的赛制规则模型、seed 与导入命令、规则查询端点、
  赛制规则页面。
- `ADD app-shell` —— 设计系统 token 与基础组件、深色侧栏应用壳、赛季×组别切换器与
  URL 路由约定。

## Design System

不经 awesome-design-md 选型：设计系统已由项目决策定为 ai-course-management 那一套
（暖纸底 `#f6f4f0` / 锈红主色 `#9c3417` / 深色侧栏 `#1c1b18` / 圆角 8px /
Noto Sans SC + JetBrains Mono），本次是**移植**而非选型。token 的事实来源是
`ai-course-management/frontend/app/globals.css` 与 `frontend/components/ui/*`，
数值逐一照搬，不取整。

界面稿不另存 `docs/superpowers/specs/mocks/` —— 那会让同一套 token 存在两处、必然漂移。
唯一事实来源是 `design/` 下的设计画板：

- `design/Rules.dc.html` — 赛制规则页 · 桌面（本次交付）
- `design/RulesMobile.dc.html` — 赛制规则页 · 移动（本次交付）
- `design/Main.dc.html`、`design/Analysis.dc.html`、`design/AnalysisGold.dc.html`
  — 队伍页与分析页，后续 change 的依据，本次只从中取共用的侧栏壳

画板同时发布为 Claude Design 画布，便于非终端环境查看与批注。
