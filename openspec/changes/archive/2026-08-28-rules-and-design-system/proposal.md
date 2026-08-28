---
Date: 2026-08-27
Change: rules-and-design-system
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-27-rules-and-design-system-requirements.md
---

## Why

Bootstrap 之后仓库里一张业务表都没有，前端只有一个占位首页，链路从未承载过真实数据。
同时紫荆杯的核心复杂度已经暴露：赛制规则按「赛季 × 组别」变化 —— 各线 UTR Cap、
Buffer 额度、分值、上场资格阈值金银两组不同且逐年调整（银组混双 2025 是 10.5、
2026 变成 10.25，Buffer 是 2026 才有的制度）。这套规则是后续 roster、阵容引擎、
阵容 UI 全部要依赖的地基，越晚建模，被写死成代码常量的地方越多。

先做这一层，同时把设计系统落地，一次性验证 `Next.js → FastAPI → Supabase(zijing_cup)`
承载真实数据。

## What Changes

- 移植设计系统到 `frontend/`：`globals.css` 的 token 块、`lib/cn.ts`、
  Button / Card / Badge / Input 四个基础组件、layout 里的 Noto Sans SC + JetBrains Mono。
  数值逐一取自 ai-course-management，不取整，不新增依赖。
- 新增应用壳：216px 深色侧栏，含赛季×组别合并切换器与三项导航；队伍与分析在本次
  呈现为禁用态并标注「未开放」。
- 新增赛制规则的数据模型（建在 `zijing_cup` schema）：赛季、组别、线定义（cap 可为
  null 表示开放线、分值、类型、次序）、资格限制（阈值 + 人数上限 + 线位白名单）。
- 新增 TOML seed 文件与导入命令：幂等 upsert，并提供 `--check` 模式在不写库的前提下
  比对 DB 与 seed，不一致则非零退出，供 CI 拦截漂移。
- seed 2025 与 2026 × 金/银四套规则。
- 新增后端只读端点 `GET /api/seasons/{year}/divisions/{code}/rules`。
- 新增前端路由 `/{season}/{division}/rules` 与「赛制规则」页面，展示该组别完整规则，
  并标注相对上一赛季的变化。
- `frontend/app/page.tsx` 的占位首页改为重定向到当前赛季的规则页。

不含破坏性变更：本次全部是新增，既有的 `/health` 端点与 `lib/api.ts` 出口不变。

## Capabilities

### New Capabilities

- `app-shell` —— 设计系统 token 与基础组件、深色侧栏应用壳、赛季×组别切换器、
  赛季与组别的 URL 路由约定。
- `competition-rules` —— 赛季×组别赛制规则的数据模型、seed 与导入命令、
  只读查询端点、赛制规则页面。

### Modified Capabilities

无。`openspec/specs/` 下目前没有已归档能力，本次两项均为新增。

## Impact

- `supabase/migrations/` —— 新增一个 migration，建规则相关表；schema-qualified DDL。
- `backend/app/` —— 新增规则的 SQLModel 定义、查询逻辑与路由；新增 seed 导入命令模块。
- `backend/seeds/` —— 新增目录，存放 TOML 规则 seed（2025/2026 × 金/银）。
- `backend/tests/` —— 导入命令幂等性与 `--check` 漂移检测、端点 200/404 路径。
- `frontend/app/globals.css`、`frontend/app/layout.tsx` —— token 与字体。
- `frontend/lib/cn.ts`、`frontend/components/ui/` —— 新增，四个基础组件。
- `frontend/app/(app)/` —— 新增应用壳 layout 与侧栏；`/{season}/{division}/rules` 页面。
- `frontend/lib/api.ts` —— 新增规则查询函数，保持单一出口。
- 依赖：前后端均不新增运行时依赖（TOML 用标准库 `tomllib`，`cn` 为手写）。

## Out of Scope

- 球队、球员、名单、参赛 UTR 的模型与导入 —— 留给 `roster-import`。
- 阵容合法性校验与阵容搜索的实现 —— 留给 `lineup-engine`。本次只存规则，不算阵容。
- 队伍页与分析页的实现 —— 留给 `roster-display` 与 `lineup-ui`；本次只交付它们共用的壳。
- 规则的编辑界面。规则变更走 seed 文件 + code review + 导入命令。
- 「三线男双不能田忌赛马」判定方式的定义，以及金组 4:4 平三级抢先的计算 ——
  两者的歧义记录在 `docs/domain/rules.md` 的「待澄清」，需向组委会确认后由
  `lineup-engine` 落地。
