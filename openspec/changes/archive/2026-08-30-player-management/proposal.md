---
Date: 2026-08-29
Change: player-management
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-29-player-management-requirements.md
---

## Why

队员现在只是名单快照里的一行：按 `(赛季, 组别)` 存，跨年不认人。要加一个人必须等一份
新的组委会总表，或者像 2026 银组 ZJU-USC 那样由人去 Dashboard 手写一条 SQL。

`roster_entries` 当初刻意不建 `players` 表，理由写在 migration 注释里：总表不带 UTR
档案 ID，跨年身份无法从数据里证明，按姓名归并会把它猜错。本 change 正面回答那条决定
——**身份仍然靠猜，但猜错了能改**。这也是本项目第一次有写接口，因此鉴权是前提而不是
实现细节。

## What Changes

- **BREAKING**：`app.openapi()["paths"]` 中不存在任何 POST/PUT/PATCH/DELETE 这条断言
  不再成立。现有测试里守着它的那条断言要改写成「写方法必须全部落在受管理员保护的路由
  前缀下」，而不是删掉——守卫本身要留着。
- 新增三张表（`zijing_cup` schema）：跨年的**队员**、按 `(人, 赛季)` 的**参赛 UTR**、
  按 `(人, 队伍)` 的**成员关系**。成员关系带代表学校、是否外援、是否外卡。
- 新增**管理员写入口**：Next 侧口令登录 + httpOnly cookie；FastAPI 侧写路由额外要求
  `X-Admin-Secret`，读路由不变。
- 新增**管理界面**五屏：登录、队员列表、队员详情（基本信息 + 各赛季参赛 UTR + 成员
  关系）、合并/拆分、未裁决冲突队列。
- 新增**迁移命令**：把线上 `roster_entries` 的 2025 与 2026 两季全部行读进新表，按
  规范化姓名归并成人。**迁移不自行裁决冲突**——现有数据里有 17 个人在金银两组各有一行
  且参赛 UTR 不同，它们被标为未裁决。
- 定义**未裁决时取较大值**的规则并在管理界面呈现；排阵页上的呈现属于后续 change。
- 侧栏新增「队员管理」项与登录态（登出、会话提示）。

## Capabilities

### New Capabilities

- `player-registry` —— 队员作为跨年实体：字段与两套互不相干的状态枚举、按赛季的参赛
  UTR（含来源与 Appeal 标记）、队伍成员关系、合并与拆分的语义、未裁决冲突的取值规则、
  赛季锁与删除的边界，以及迁移契约。
- `admin-access` —— 管理员身份与写接口防护：登录、会话、`X-Admin-Secret`、
  「默认拒绝」的中间件形状、凭据不进浏览器。
- `player-admin-ui` —— 管理界面：五屏的信息结构与那些不能省的呈现（未裁决与预填要
  可见、不可撤销要警告、两个值都要显示才可裁决）。

### Modified Capabilities

- `app-shell` —— 侧栏多一项「队员管理」，并第一次有登录态要呈现（当前身份、登出、
  会话到期）。未登录时它不能是一个点了没反应的入口。

## Impact

- `supabase/migrations/` —— 一个新 migration，三张表，全部 schema-qualified。
- `backend/app/models/` —— 三个新 SQLModel 映射。
- `backend/app/players/` —— 新模块：查询、写入、合并/拆分、迁移命令。纯逻辑（归并、
  冲突判定、拆分的行归属）与数据库访问分开，理由同 `app/lineups/`。
- `backend/app/auth.py` —— 增加管理员校验，形状与现有中间件一致：**减法式**，新路由
  不声明就已经受保护，缺失的密钥意味着谁都进不来。
- `backend/app/routers/` —— 新增读路由与**本项目第一批写路由**。
- `backend/tests/test_roster_api.py` —— 那条「不存在写方法」的断言要改写，不是删除。
- `frontend/lib/api.ts` —— 新增取数与写入函数（仍是唯一出口）；写入走 Server Action。
- `frontend/app/[season]/[division]/players/` —— 管理界面；`login/` 登录页。
- `frontend/app/[season]/[division]/Sidebar.tsx` —— 多一项与登录态。
- 部署：Render 与 Vercel 各多一个环境变量（`ADMIN_SECRET` / 管理员口令哈希）。

## Out of Scope

- **读路径切换**（`team-roster` 与 `lineup-search` 改读新表）—— 下一个 change，紧接
  本次。在它落地前，管理员在管理界面里做的修改在球队名单页与排阵页上**看不见**。
- **名单 CSV 导入器改写**（写新表、遇到不存在的队员能新建）—— 再下一个 change。本次
  落地到它落地之间**暂停名单导入**，名单变更走管理界面。
- **多角色权限**（队长/球员分级）。只有一个管理员。
- **UTR 同步**。当前单打/双打 UTR 由人工录入。
- **操作历史/审计日志**。合并与拆分不可撤销，界面上要说清楚。
- **移动端版式**。管理界面是桌面场景。
