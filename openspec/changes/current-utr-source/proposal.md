---
Date: 2026-08-31
Change: current-utr-source
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-31-current-utr-source-requirements.md
---

## Why

`players` 表上的五个字段 —— 当前单打 / 双打 UTR、各自状态、UTR 档案 ID —— **一个都没有
值**。后端 `PATCH /api/players/{id}` 早就能写它们，但迁移不带这些数据、名单 CSV 里没有
这些列、界面上也没有任何编辑口，于是名单页那两列一整列是 `—`。

代价不只是两列空白：参赛 UTR 推导链的第二步（当前 `rated` 双打值）**永远不命中**，
只能靠第三步（最近一个有值赛季）接住。9/21–9/25 取样窗口之前组委会的参赛 UTR 还没
出来，当前 UTR 是唯一能先估一估阵容的依据。

## What Changes

- **按队的往返表**：系统导出一张已带 `id` 与姓名的表 → 人在 Google Sheets 里填 UTR
  那几列 → 整块贴回或作为 CSV 传回。
- **身份靠 id 往返，不做匹配**。`players.id` 原样出去原样回来，中间没有「这一行是谁」
  这个判断；姓名同行带回，只作**校验位**。这是本 change 的核心决定：profile ID 会变、
  姓名会重，两者都不能当依据。
- **两步落库**：解析后先出差异屏，确认才写。有任何一行被拒 → **整批不写**。
- **「空」有三种含义**：空白 = 不改，`-` = 清空，值与状态必须成对。
- **名单页就地改**：整行变输入框，一次一个人，补一个人不必走一趟往返。
- 顺带把 `utr_profile_id` 收上来 —— 不当匹配依据，只让页面能跳到那个人的 UTR 档案。

## Capabilities

### New Capabilities

- `current-utr-io` —— 当前 UTR 的往返导入导出：表格形态、id 往返与姓名校验、
  「空」的三种含义、差异计算与整批拒绝规则。这是一块新的领域逻辑（一个纯函数层
  加两个端点），不属于既有任何一个能力。

### Modified Capabilities

- `player-registry` —— 新增按队读取「导出所需的一行」与按 id 批量写这五个字段的
  端点；写路由照旧由中间件按 HTTP 方法保护。
- `team-roster-ui` —— 名单页新增就地编辑与通往批量导入的入口；未登录时两者都不出现。
- `player-admin-ui` —— 复用它的登录门与 Server Action 形态；新路由 `teams/[code]/utr`
  要自己配一份（不能靠 `players/layout.tsx` 覆盖到）。

## Impact

- `backend/app/players/utr_sheet.py`（新）—— 表格的解析、比对与差异计算，纯函数，
  不碰 session。
- `backend/app/routers/players.py` —— 两个新端点：按队取导出行、按 id 批量写。
- `frontend/app/[season]/[division]/teams/[code]/utr/` —— 导出/导入两个 tab、差异屏、
  Server Action、自己的登录门与 `error.tsx`。
- `frontend/app/[season]/[division]/teams/[code]/RosterTable.tsx` —— 就地编辑。
- `frontend/lib/api.ts` / `lib/admin.ts` —— 新端点的读写封装。
- 无 migration：五个字段都已存在。

## Out of Scope

- **吃 UTR 官网的导出文件**（`utr-export-ingest`，已在 backlog）。那条路要一整屏
  匹配确认界面，且在拿到真实导出文件之前是凭空设计。
- **与 UTR 官网自动同步/抓取**。
- **动参赛 UTR**（`player_season_utrs`）—— 那是赛季冻结值，有自己的裁决与锁流程。
- **导入历史 / 审计表**。谁在什么时候改了什么，本次不留痕。
- **改推导链**。四步不变，本 change 只是让第二步终于有数据可用。
- **移动端版式**（`mobile-shell`）。
