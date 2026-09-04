---
Date: 2026-09-03
Change: lineup-page-defaults
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-03-lineup-page-defaults-requirements.md
---

## Why

排阵页现在一进来就整解一次候选——冷启动的免费实例上这是最慢的请求，而队长多数
时候只想先看那几套已存阵容的当前状态。同时候选与已存阵容的呈现不一致、性别/UTR
不好一眼看全，载入阵型会立刻触发一次没人要的搜索，改阵还得先跳 `/login`。这批改动
把默认状态从「每次都算」改成「先给你存好的、要算再算」，并统一详情、就手编辑。

## What Changes

- **右栏重构为「上=已存阵容(可折叠) + 下=候选(默认空)」**，保留现有左右两栏（左搜索
  控件、右排阵区）。默认打开右栏下半没有候选。
- **搜索显式化**：候选只在带 `go=1` 时计算。不带 `go` = 草稿（回显控件、显示已存
  阵容、不整解）。带 `go=1` 的链接直访仍直接出候选（可分享不变）。
- **载入阵型改为预填现有控件、不即搜、可保存**：载入把锁定/排除填进现有
  `LineupControls`（不新画），进入草稿态；点「搜索阵容」才算；改过的这套能保存
  （覆盖/另存），不必先搜。
- **已存阵容与候选统一「每条线 3 行块」**：行1 线名+参赛UTR和+该线buffer占用；
  行2/3 两名队员一人一行（姓名 + 性别符号 ♂/♀ + UTR）；五条线块横排一行。
- **就地解锁编辑**：排阵/已存阵容页加「编辑模式」开关，就地输 admin 密码解锁已有
  编辑能力（保存候选、编辑/删除已存阵容），走现有登录 action、免跳 `/login`。

## Capabilities

### New Capabilities

（无——全部是对 `lineup-ui` 的需求修改。）

### Modified Capabilities

- `lineup-ui` — 默认视图（右栏折叠已存阵容 + 默认空候选）、`go` 门控搜索、载入语义
  （预填现有控件 + 不即搜 + 可保存）、候选/已存阵容统一 3 行块详情、就地解锁编辑。

## Impact

- 前端 `app/[season]/[division]/lineup/[code]/`：`page.tsx`（`go` 门控、右栏组装、
  默认不搜）、`LineupResults` / `CandidateTable` / `CandidateRow`（3 行块详情）、
  `SavedLineups`（右栏折叠区复用 + 3 行块对齐候选）、`LineupControls`（载入预填 +
  保存入口，不重画控件）、新的「编辑模式」就地解锁组件（复用 `lib/admin` / 登录
  action）。
- 后端：无新端点、无 migration、不改引擎与鉴权模型。已存阵容的 `line_totals` /
  `buffer_spent` 已在 `lineup-saved-lineups` 落地可直接复用；候选本就带 `line_totals`。
- `lib/api.ts`：候选/已存阵容取数形状基本不变（3 行块所需字段已具备）。

## Out of Scope

- 不新增编辑能力本身（保存候选、就地互换/替换、存回都已在 `lineup-saved-lineups`）。
- 不改后端合法性引擎、`check_lineup`、鉴权模型（就地解锁复用现有登录 action 与会话）。
- 草稿不做跨会话持久化（草稿就是当前 URL）。
- 是否保留 `/saved` 独立页由呈现层决定（默认右栏已内嵌已存阵容，`/saved` 可留作深链接）。
