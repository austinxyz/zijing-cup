---
Date: 2026-09-07
Change: lineup-mobile-polish
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# lineup-mobile-polish — 排阵页手机版式修整

排阵页在手机上不友好：顶部信息条（`五线 cap … · 全队 buffer … · 搭档差距 …`）逐词竖排成一长列，
占满小半屏；已存阵容卡片在窄屏偏挤、且有横向溢出（截图里 D2 被右边缘切）。本 change 只修这两块的
mobile 版式，不改任何数据、逻辑或桌面版。

## Goals

1. **顶部信息条 mobile 竖排堆叠。** header 现在是 `flex items-center justify-between` 从不换行——mobile 上
   右侧控件块 `flex-none` 抢宽，左侧标题块被压到 ~90px，cap 那行逐词竖列。改成 mobile 竖排
   （`flex-col`）、桌面保持横排（`md:flex-row`）；cap/buffer/搭档那行拿到整宽后正常折行（词边界，不逐字竖列）。
2. **次要注解 mobile 省略。** `参赛 UTR · 赛前冻结` 这类注解在 mobile 隐藏（`hidden md:…`），编辑/登出控件保留。
3. **已存阵容卡片不横向溢出、窄屏好读。** 卡片（含线块 grid、UTR-diff 说明、buffer 行）在手机宽度内不产生
   横向滚动/被切；线块保持 mobile 两列（`grid-cols-2`）。
4. **桌面版不变、数据/逻辑不变。** 仅响应式类调整；`md:` 及以上与现在一致。

## Non-Goals

- 不改候选结果、drawer、锁定/排除等其它排阵区块（本次只碰 header + 已存阵容）。
- 不改后端、数据、排阵逻辑、评价/UTR 任何行为。
- 不重设计视觉风格；沿用现有 token 与版式语言，只修 mobile 折行/堆叠/溢出。

## Constraints

- 纯前端响应式类（Tailwind）调整；无后端、无 migration。
- 桌面（`md:` 断点及以上）渲染必须与当前一致——只加/改 mobile-first 基类与 `md:` 覆盖，别动桌面表现。
- `h-screen overflow-hidden` 壳规则仍在：可变长内容自带滚动，别引入整页横向滚动。
- `npm run test` 不做类型检查——验证带 `npx tsc --noEmit`；新源码无 `console.log`。

## Success Criteria

1. 375px 宽：顶部信息条竖排，cap/buffer/搭档那行按词折行成 1–3 行、不逐字竖列；`参赛 UTR · 赛前冻结` 不显示。
2. 375px 宽：已存阵容卡片无横向滚动/不被切；线块两列、UTR-diff 说明与 buffer 行可读。
3. 桌面（≥768px）header 与已存阵容卡片与改动前一致（横排、原注解在位）。
4. 前端 vitest + `npx tsc --noEmit` 全绿；无 console.log。
5. 本地真机（in-app 浏览器 mobile 视口 375px）实测排阵页 header 与已存阵容——与上述一致。

## User Stories

N/A (bounded)

## Open Questions

N/A (bounded) — 方向已定：header mobile 竖排 + cap 行整宽折行 + 次要注解 `hidden md:`；已存阵容卡片消横向溢出、
线块保持两列。设计细节（断点处具体类、是否给 cap 行更紧凑形态）在 propose/apply 定，视觉稿对照。

## Referenced Capabilities

- `lineup-ui`（排阵页版式；本 change 只调它的 header 与已存阵容卡片的 mobile 响应式类）
- `app-shell`（移动壳/断点约定：可变长内容自带滚动、不引入整页横向滚动）
