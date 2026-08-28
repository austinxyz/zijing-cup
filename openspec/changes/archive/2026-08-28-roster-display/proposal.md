---
Date: 2026-08-28
Change: roster-display
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-28-roster-display-requirements.md
---

## Why

名单已经落库（2025 金组 6 队 120 人、银组 18 队 339 人）并由两条只读端点提供，
但没有任何界面消费它——队长要看名单还是得回 Google Sheet 翻。侧栏里的「队伍」
至今是禁用态。这一页是队长赛前真正会反复打开的那一页。

## What Changes

- 新增两条路由 `/[season]/[division]/teams` 与 `.../teams/[code]`：左侧球队列
  常驻，右侧是选中队的名单；未选队时右侧是空状态而非空表格。
- 球队列每行显示 `code` + 总人数 + 男/女人数，按 `code` 字母序。女队员人数
  是硬约束（混双 1 名 + 女双 2 名，场上至少 3 名），比全队平均 UTR 更该占这个位置。
- 名单表按参赛 UTR 降序，列出姓名、性别、参赛 UTR、UTR 来源。
- 「UTR 来源」同时显示我们的判断与总表原文：已认证 / 委员会审定 / **待定**。
  `rating_class` 为 NULL 的行显示「待定」，**不显示**任何具体类别。
- 球队新增可选中文名 `display_name`：`zijing_cup.teams` 加一列（新 migration），
  内容由 seed 文件 + 导入命令维护，名单导入器不得触碰。
- `frontend/lib/api.ts` 增加两个取数函数；侧栏「队伍」从 `PendingNavItem`
  改为真链接，「分析」仍为禁用态。
- 移动端两屏：球队列表 → 某队名单，名单在 390px 下用行卡片而非表格。

## Capabilities

### New Capabilities

- `team-roster-ui` —— 名单的浏览界面：路由约定、球队列与名单表的信息取舍、
  「待定」的呈现契约、空状态与错误态、移动端版式。

### Modified Capabilities

- `team-roster` —— 数据模型与只读端点新增球队显示名：`teams` 表加
  `display_name`，`TeamSummaryOut` / `TeamOut` 带出该字段，并新增一条
  seed 导入命令。该字段是人工维护的，名单导入器的字段归属规则要显式覆盖它。
- `app-shell` —— 侧栏导航项「队伍」由「未开放」禁用态改为指向
  `/[season]/[division]/teams` 的链接。

## Impact

- `supabase/migrations/` —— 新增一个 migration 给 `zijing_cup.teams` 加
  `display_name`。**必须手工在 Supabase Dashboard 执行**（共享项目禁用 CLI push）。
- `backend/app/models/roster.py`、`backend/app/rosters/query.py` ——
  模型与响应模型加字段。
- `backend/app/seeds/` —— 新增球队显示名的 seed 解析与导入命令，
  沿用 `load_rules` 的「解析 → 读库 → 比对 → 只写差异 + `--check`」形态。
- `backend/app/rosters/load.py` —— 字段归属：`display_name` 加入
  导入器不写的字段集合，并加测试锁住。
- `frontend/lib/api.ts` —— 两个取数函数与对应 TypeScript 类型。
- `frontend/app/[season]/[division]/teams/` —— 新路由、layout、页面、
  `error.tsx`、`loading.tsx`。
- `frontend/app/[season]/[division]/Sidebar.tsx` —— 「队伍」改为链接。

## Out of Scope

- **当前 UTR**（实时同步值）。库里只有赛前冻结的参赛 UTR 与五日取样，
  没有数据源；对接 UTR 官网涉及认证、球员与 UTR 档案的对应关系
  （`utr_profile_id` 现在全是 NULL）、缓存与失败降级，是独立能力。
- **界面上编辑球队中文名**。需要先解决认证——本项目没有 per-user 登录，
  公开写端点等于谁都能覆盖所有队的数据。另开 change。
- **外援标记的展示与录入**。字段在库里、全是 NULL，本次不显示这一列。
  `lineup-engine` 需要它查外援人数上限，到时会被它卡住。
- **阵容推荐与合法性判定**（各线最优搭档、cap/buffer 校验）——`lineup-engine`。
- **五日取样明细**。银组 39 人的取样格是 `Early Lock` 文字注记、值本身缺失，
  展开是一片空洞表格。
- 搜索、筛选、排序切换、跨队比较视图。
