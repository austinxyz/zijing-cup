### Contract
- **Spec**: lineup-ui —— 「排阵页顶部 header 窄屏竖排堆叠；cap/buffer/搭档那行整宽按词折行、不逐字竖列；
  桌面保持横排 `justify-between`；`参赛 UTR · 赛前冻结` mobile 隐藏」；「已存阵容卡片 mobile 不横向溢出：
  卡片/线块网格 `min-w-0`、seat 名字省略号、线块保持 `grid-cols-2`；UTR-diff 说明与 buffer 行整宽折行」。
- **Runtime**: `cd frontend && npm run test -- "lineup/[code]/page" SavedLineups LineBlock LineupResults` + `npx tsc --noEmit` → expected: header 响应式类（`flex-col … md:flex-row`）与注解 `hidden md:` 的断言过、已存阵容/线块结构测不回归；tsc 干净。**真判定靠 1.4 VISUAL DIFF 在 375px 实测。**
- **Code**: `page.tsx` header 外层 `flex items-center justify-between` → `flex flex-col gap-2 md:flex-row md:items-center md:justify-between`，右侧控件块 mobile 分行；`参赛 UTR · 赛前冻结` 加 `hidden md:inline`（包裹层 `hidden md:flex`）。`SavedLineups`/`LineBlock`：卡片容器与线块网格补 `min-w-0`、seat 名字 `min-w-0 truncate`，消窄屏横向溢出，线块 `grid-cols-2` 不变。只加 mobile-first 基类 + `md:` 覆盖，桌面对 ≥md 为 no-op。
- **Threshold**: 70

