---
Date: 2026-09-04
Change: scoped-admin-auth
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-09-04-scoped-admin-auth-requirements.md
---

## Why

现在只有一个全局管理员密码，谁解锁都能改所有比赛——负责人没法把某组的编辑权只交给该组队长。
要按比赛（赛季+组别）分密码，各自只解锁对应比赛；负责人自己的密码升级为 super（解锁全部）。

## What Changes

- **会话带 scope**：cookie 签名载荷加 `scope`（`"*"` 或 `"<season>:<division>"`）；篡改即签名失效。
- **`authenticate(season, division, password)`**：先比 super（复用现有 `ADMIN_PASSWORD_HASH`）→ scope
  `"*"`；否则取该比赛 DB hash 比 → scope `"<season>:<division>"`；都不中失败（沿用限速/反馈）。
- **`canEdit(season, division)`** 取代全局 `isSignedIn()` 作为「能否编辑」判据（`scope==="*" ||
  scope===该比赛`）；所有取值点（layout、teams/lineup/players 页、saved 页）改按比赛判。
- **`adminWrite` 越权拒**：收目标比赛，会话 scope 盖不住即抛错、不发 `X-Admin-Secret`。
- **`admin_credentials` 表** + migration + 后端 GET（读 hash，`X-Backend-Secret` 保护）/ PUT（upsert，
  按方法判权自动受 `X-Admin-Secret` 保护）。
- **super 专属改密码页**：选赛季/组别 + 输新密码 → server action 校验 scope `"*"` → Next 侧 scrypt
  → PUT 写 DB。非 super 打不开/调不动。
- 就地解锁表单（`EditModeToggle` 等）带上 season/division；players 页改就地按比赛解锁；`/login`
  作为 super 入口。

## Capabilities

### New Capabilities

- `admin-credentials` — 按比赛的密码凭据：`admin_credentials` 表、后端 GET/PUT、super 专属改密码
  页与 server action（Next 侧 hash、scope `"*"` 门）。

### Modified Capabilities

- `admin-access` — 单一全局密码 → 按比赛 scope + super。会话载荷加 scope、`authenticate` 三分支、
  `canEdit(season,division)`、`adminWrite` 按 scope 拒、就地解锁带 season/division、super 复用
  `ADMIN_PASSWORD_HASH`。

## Impact

- **Schema / migration**：`admin_credentials(season_year, division_code, password_hash, updated_at)`，
  唯一 `(season_year, division_code)`，`zijing_cup` schema。远程 Dashboard 手工执行、本地打 127.0.0.1
  （禁 CLI push）；**push 前先跑远程否则线上 500**。
- **后端**：`app/models/`（新 `AdminCredential` 模型）；`app/routers/`（GET/PUT admin-credentials，
  方法判权自动保护写）；无需改 `app/auth.py` 中间件（读靠 X-Backend-Secret、写靠 X-Admin-Secret，
  均已由方法判权覆盖）。
- **前端**：`lib/session.ts`（scope 进 `Session`/`issueSession`/`readSession`；`checkPassword` 保留、
  加按比赛取 DB hash 的读取；`authenticate` 三分支）；`lib/admin.ts`（`canEdit(season,division)`、
  `adminWrite` 收目标比赛按 scope 拒、其余不变）；`app/login/actions.ts`（`authenticate` 带
  season/division，`unlockAdmin`/`login` 传参）；`EditModeToggle`/`LineupEditHeaderControl`/
  `TeamEditHeaderControl` 解锁表单加 season/division 隐藏字段；各页 `canEdit` 调用点改按比赛；
  players layout 就地解锁；新增 super 改密码页 + server action。

## Out of Scope

- 队长/球员级细粒度权限、多用户账号、密码找回；后端分级（scope 仅前端会话概念）；super 密码
  轮换（仍改 env，复用现有）。
