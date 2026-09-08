# Tasks — lineup-mobile-polish

## 1. 排阵页 header + 已存阵容卡片 mobile 版式

### Contract
- **Spec**: lineup-ui —— 「排阵页顶部 header 窄屏竖排堆叠；cap/buffer/搭档那行整宽按词折行、不逐字竖列；
  桌面保持横排 `justify-between`；`参赛 UTR · 赛前冻结` mobile 隐藏」；「已存阵容卡片 mobile 不横向溢出：
  卡片/线块网格 `min-w-0`、seat 名字省略号、线块保持 `grid-cols-2`；UTR-diff 说明与 buffer 行整宽折行」。
- **Runtime**: `cd frontend && npm run test -- "lineup/[code]/page" SavedLineups LineBlock LineupResults` + `npx tsc --noEmit` → expected: header 响应式类（`flex-col … md:flex-row`）与注解 `hidden md:` 的断言过、已存阵容/线块结构测不回归；tsc 干净。**真判定靠 1.4 VISUAL DIFF 在 375px 实测。**
- **Code**: `page.tsx` header 外层 `flex items-center justify-between` → `flex flex-col gap-2 md:flex-row md:items-center md:justify-between`，右侧控件块 mobile 分行；`参赛 UTR · 赛前冻结` 加 `hidden md:inline`（包裹层 `hidden md:flex`）。`SavedLineups`/`LineBlock`：卡片容器与线块网格补 `min-w-0`、seat 名字 `min-w-0 truncate`，消窄屏横向溢出，线块 `grid-cols-2` 不变。只加 mobile-first 基类 + `md:` 覆盖，桌面对 ≥md 为 no-op。
- **Threshold**: 70

- [x] 1.0 CONTRACT — write openspec/changes/lineup-mobile-polish/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [x] 1.1 MOCK — open docs/superpowers/specs/mocks/2026-09-07-lineup-mobile-polish-mocks.html；记 mobile 目标：header 竖排、cap 行整宽折行、`参赛 UTR · 赛前冻结` 隐藏、已存阵容卡片不横向溢出/线块两列/名字省略号
- [x] 1.2 RED — `page.test.tsx`（或相邻）：断 header 外层含 `flex-col` 且 `md:flex-row`、`参赛 UTR · 赛前冻结` 元素带 `hidden`/`md:` 类；断言先失败（现为 `items-center justify-between`、注解无 hidden）
- [x] 1.3 GREEN — 改 header 响应式类 + 注解 `hidden md:`；`SavedLineups`/`LineBlock` 补 `min-w-0`/`truncate`；保持既有单测绿
- [x] 1.4 VISUAL DIFF — bring up dev stack；in-app 浏览器 `resize_window` 375px 开排阵页（解锁 + 有已存阵容）：比对 header 竖排/cap 折行/注解隐藏、已存阵容卡片无横向滚动/线块两列/名字省略号 与 mock；再切 ≥768px 确认桌面不变；修 token/类漂移
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs/lineup-ui/spec.md + design.md + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores (threshold 70); ≥70 PASS else FIX + retry

## 2. 验证

### Contract
- **Spec**: lineup-mobile-polish 全部 SHALL。
- **Runtime**: `cd frontend && npm run test` 全绿 + `cd frontend && npx tsc --noEmit` 0 错 + 新源码无 console.log。
- **Code**: 交付后本地实测（补种 + 解锁 + 有已存阵容）：375px 排阵页 header 竖排/cap 折行/注解隐藏、已存阵容卡片
  不横向溢出/线块两列；≥768px 桌面与改前一致。pitfall：先测→再补种→再视觉；前端 dev 起 preview_start；
  `resize_window` mobile 后要 reload 让断点重算；无 migration、无远程前置。
- **Threshold**: 80

- [x] 2.1 Run superpowers:verification-before-completion — 前端 vitest + tsc + console.log 审计全过；本地 375px + 桌面 双断点 e2e 实测；修任何失败再收工
