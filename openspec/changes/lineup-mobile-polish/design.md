## Context

排阵页 `lineup/[code]/page.tsx` 的顶部 header 是 `flex items-center justify-between`，从不换行；mobile 上右侧
控件块 `flex-none` 抢宽，左侧标题块（含 `五线 cap …` mono 行）被压到 ~90px → 逐词竖列。已存阵容卡片
（`SavedLineups.tsx`）线块已是 `grid-cols-2 sm:grid-cols-5`，但窄屏仍见横向溢出（seat 名字/卡片无 `min-w-0`）。
桌面版都正常——这是纯 mobile 响应式问题。

## Goals / Non-Goals

**Goals:** header mobile 竖排 + cap 行整宽折行 + 次要注解 `hidden md:`；已存阵容卡片消横向溢出、线块保持两列。
**Non-Goals:** 不动桌面（≥md）表现；不碰候选/drawer/锁定；无后端/数据/逻辑改动。

## Decisions

- **D1 header 响应式竖排**：外层 `flex items-center justify-between` → `flex flex-col gap-2 md:flex-row
  md:items-center md:justify-between`。右侧控件块 mobile 与标题分行；cap 行在标题块内、mobile 整宽自然折行
  （去掉压窄它的同行竞争即可，不需给它特殊 `break`）。
- **D2 次要注解 `hidden md:inline`**：`参赛 UTR · 赛前冻结` 加 `hidden md:inline`（或包裹层 `hidden md:flex`），
  mobile 省高度；编辑控件 `LineupEditHeaderControl` 始终显示。
- **D3 已存阵容消溢出**：`SavedLineups` 卡片容器与线块网格补 `min-w-0`（grid item 默认 `min-width:auto` 会撑破
  网格）；`LineBlock` seat 名字容器 `min-w-0 truncate`（若尚未）。目标是窄屏零横向滚动，线块 `grid-cols-2` 不变。
- **D4 只加 mobile-first 基类 + `md:` 覆盖**：桌面用 `md:` 恢复现状，改动对 ≥md 是 no-op。

## Risks / Trade-offs

- **[改 header 影响桌面]** → 桌面全部走 `md:` 覆盖回原样；VISUAL DIFF 两个断点都比对（375 与 ≥768）。
- **[`min-w-0` 连带布局变化]** → 只加在真正溢出的容器；跑既有 `LineupResults`/`SavedLineups`/`LineBlock` 单测
  确认结构断言不回归；`npx tsc --noEmit` 干净。
- **[单测测不出布局]** → 响应式/溢出是视觉的，vitest 只能断类名；真判定靠 VISUAL DIFF 在 375px 实测
  （in-app 浏览器 `resize_window` mobile）。

## Migration Plan

无数据库变更、无 migration、无远程前置。纯前端响应式类；push 即部署。

## Open Questions

无。断点处具体类在 apply RED/GREEN + VISUAL DIFF 里定，视觉稿对照。
