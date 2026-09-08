## ADDED Requirements

### Requirement: 排阵页顶部信息条 mobile 竖排

排阵页顶部 header 在窄屏（< md）SHALL 竖排堆叠：标题（队名/人数）与编辑控件不再挤在一行把标题块压窄。
`五线 cap … · 全队 buffer … · 搭档差距 …` 那行 SHALL 拿到整行宽度、按词折行（1–3 行），MUST NOT 逐字
竖列。桌面（≥ md）SHALL 保持现在的横排 `justify-between`。次要注解 `参赛 UTR · 赛前冻结` 在 mobile
SHALL 隐藏（`hidden md:…`），编辑/登出控件保留。

#### Scenario: 375px 顶部信息条
- **WHEN** 在 375px 宽打开排阵页
- **THEN** header 竖排；cap/buffer/搭档那行按词折行成 1–3 行、不逐字竖列；`参赛 UTR · 赛前冻结` 不显示

#### Scenario: 桌面不变
- **WHEN** 在 ≥768px 打开排阵页
- **THEN** header 横排 `justify-between`、cap 行单行、`参赛 UTR · 赛前冻结` 在位——与改动前一致

### Requirement: 已存阵容卡片 mobile 不横向溢出

已存阵容卡片在窄屏 MUST NOT 产生横向滚动或被右边缘切。卡片与线块网格 SHALL `min-w-0`、seat 名字过长
省略号，线块 SHALL 保持两列（`grid-cols-2`，5 线 → 2+2+1）；UTR-diff 说明与 buffer 行 SHALL 整宽折行、可读。

#### Scenario: 375px 已存阵容卡片
- **WHEN** 在 375px 宽查看某已存阵容卡片
- **THEN** 卡片不横向滚动、线块两列、名字过长省略号、UTR-diff 说明整宽折行

#### Scenario: 桌面线块布局不变
- **WHEN** 在 ≥768px 查看已存阵容
- **THEN** 线块按现有（`sm:grid-cols-5` 等）布局，与改动前一致
