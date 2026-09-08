---
Date: 2026-09-07
Change: lineup-mobile-polish
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-07-lineup-mobile-polish-requirements.md
---

## Why

排阵页在手机上不友好：顶部信息条（`五线 cap … · 全队 buffer … · 搭档差距 …`）在窄屏逐词竖排成一长列、
占掉小半屏；已存阵容卡片偏挤、有横向溢出（D2 被右边缘切）。纯 mobile 版式问题，桌面正常。

## What Changes

- 排阵页顶部 header 在 mobile 竖排堆叠（`flex-col` → `md:flex-row`），cap/buffer/搭档那行拿到整宽后按词折行，
  不再逐字竖列；`参赛 UTR · 赛前冻结` 这类次要注解 mobile 隐藏。
- 已存阵容卡片在 mobile 不横向溢出（卡片/线块网格 `min-w-0`、名字省略号），线块保持两列，UTR-diff 说明整宽折行。
- **只改响应式类**，桌面（≥768px）表现不变；无后端、无数据、无逻辑改动、无 migration。

## Capabilities

### New Capabilities

<none>

### Modified Capabilities

- `lineup-ui` — 排阵页 header 与已存阵容卡片的 mobile 响应式版式：header 窄屏竖排 + cap 行整宽折行 + 次要
  注解 `hidden md:`；已存阵容卡片消横向溢出、线块两列。桌面版式与行为不变。

## Impact

- **前端**：`lineup/[code]/page.tsx`（header 那个 `flex justify-between` 改响应式竖排 + 注解 `hidden md:`）；
  `SavedLineups.tsx` / `LineBlock.tsx`（卡片与线块网格 `min-w-0`、seat 名字省略号，消横向溢出）。
- 纯响应式 className；**无后端、无 migration、无远程前置**。

## Out of Scope

- 候选结果、drawer、锁定/排除等其它排阵区块的 mobile 走查（本次只 header + 已存阵容）。
- 桌面版式改动；视觉风格重设计；任何数据/逻辑行为。
