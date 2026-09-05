---
Date: 2026-09-04
Change: scoped-admin-auth
Status: REVIEWED
HAS_UI_SURFACE: no
---

# scoped-admin-auth — 按比赛分的管理员密码 + super 超级密码

当前只有一个全局管理员密码（`ADMIN_PASSWORD_HASH`），任何解锁都能编辑所有比赛。要改成
**按比赛（赛季 + 组别）分密码**：如 2026 银组一个密码、2026 金组一个密码，各自解锁**只能
编辑对应那一个比赛**；另有一个 **super 超级密码**（仅负责人用）解锁全部。

## Goals

1. **会话带作用域（scope）。** 登录/解锁成功后，会话 cookie 记一个 scope：`"*"`（super，可编辑
   全部）或 `"<赛季>:<组别>"`（如 `2026:silver`，只能编辑该比赛）。`canEdit(season, division)`
   = `scope === "*" || scope === "<season>:<division>"`。
2. **比赛密码存 DB。** 新表 `admin_credentials(season_year, division_code, password_hash,
   updated_at)`，`(season_year, division_code)` 唯一。hash 用现有 `session.ts` 的 scrypt
   （`salt:hash`）。后端两端点：GET 读该比赛 hash（与所有路由一样受 `X-Backend-Secret` 保护，
   只有 Next 服务端能取）、PUT upsert（写，按方法判权自动受 `X-Admin-Secret` 保护）。
3. **super 复用现有 env。** super 密码就是现有的 `ADMIN_PASSWORD_HASH`（不新增 env，向后兼容：
   负责人现在的密码继续在所有比赛生效，scope `"*"`）。
4. **解锁按比赛判密码。** `authenticate(season, division, password)`：先比 super（`ADMIN_PASSWORD_HASH`）
   → 命中发 scope `"*"`；否则取该比赛 DB hash 比对 → 命中发 scope `"<season>:<division>"`；都不中
   按原样失败（沿用现有限速与反馈）。就地解锁表单（`EditModeToggle` 等）带上 season/division。
5. **作用域在前端强制。** `adminWrite` 收目标比赛，会话 scope 盖不住就拒（不发 `X-Admin-Secret`）；
   所有 `canEdit` 取值点改成按比赛判。后端不变（仍共享密钥 + 按方法判权，不做分级）。
6. **super 专属改密码页。** super 登录后可选赛季/组别 + 输新密码 → 服务端（校验 scope `"*"`）
   在 Next 侧 hash → PUT 写 DB。非 super 打不开、也调不动该 server action。

## Non-Goals

- N/A (bounded) —— 不做队长/球员级细粒度权限、不做多用户账号体系、不改后端「共享密钥 + 按方法
  判权、不分级」的信任模型（scope 仅前端会话概念）；不做密码找回/邮件；super 密码轮换仍走改
  env（复用现有）。

## Constraints

- 架构不变：浏览器→Next→FastAPI→DB；只有 Next 服务端持 `BACKEND_SECRET`/`ADMIN_SECRET`；写鉴权
  按 HTTP 方法判（新写端点默认受保护）。scope 是 Next 会话概念，后端不感知。
- `zijing_cup` schema；migration 是唯一来源；远程共享库不跑 CLI push——Dashboard 手工执行、本地
  打 127.0.0.1；**带 migration 的 change，push 前先跑远程否则线上 500**。
- 密码 hash 只在 Next 侧算/比（`session.ts` 的 scrypt）；后端只存/回字符串，明文绝不过后端。
- 比赛 hash 的 GET 在用户认证**之前**被 Next 调用（登录时），故只能靠 `X-Backend-Secret`（服务端
  持有）保护，不能要求 admin——但也因此非 Next 调用方拿不到。
- 会话 cookie 仍 httpOnly + HMAC 签名；scope 进签名载荷，篡改 scope 即签名失效。
- 失败关闭：super env 未配 → super 登录不了（同现状）；某比赛无 DB 密码行 → 该比赛只有 super 能
  解锁（不是「无密码放行」）。

## Success Criteria

1. `admin_credentials` 表存在（唯一 per 比赛）；后端 GET 返回 hash/404、PUT upsert；均需
   `X-Backend-Secret`，PUT 另需 `X-Admin-Secret`。
2. 用 2026 银组密码解锁 → 只能编辑 2026 银组：该比赛页 `canEdit` 真、写成功；换到 2026 金组或
   2025 任意组，`canEdit` 假、写被前端拒（不发后端）。
3. 用 super（现有 `ADMIN_PASSWORD_HASH`）解锁 → 所有比赛 `canEdit` 真、写成功。
4. super 改密码页：非 super 打不开/调不动；super 选比赛 + 输密码 → DB 写入新 hash → 之后该比赛
   密码即新值（旧值失效）。
5. 会话 scope 篡改（改 cookie 载荷里的 scope）→ 签名失效、会话作废。
6. 后端 + 前端测试覆盖：scope 判定（super/命中/不命中/跨比赛拒）、authenticate 三分支、
   adminWrite 越权拒、改密码页 super 门、hash 只在 Next 算；`npx tsc --noEmit` 干净。迁移前后端
   降级不 500（读 hash 失败按「无密码」处理，只 super 能进）。

## User Stories

- 作为负责人，我把 2026 银组密码给银组队长、金组密码给金组队长，各自只能改自己那组；我用自己的
  super 密码哪组都能改。
- 作为银组队长，我用银组密码解锁，能改银组的名单/阵容/UTR；点到金组只能看，改不了。
- 作为负责人，我在 super 页给 2026 金组重设一个新密码，旧密码立刻失效。

## Open Questions

（无——密码存 DB、super 复用现有 env、scope 前端强制、改密码走 super 专属页，均已定。剩下的
`/login` 与 players 页解锁细节按「就地按比赛解锁、`/login` 作为 super 入口」实现，设计阶段定。）

## Referenced Capabilities

- `admin-access`（修改）：从单一全局密码改成按比赛 scope + super。会话载荷加 scope；
  `authenticate(season,division,pwd)` 三分支；`canEdit(season,division)`；`adminWrite` 收目标
  比赛并按 scope 拒；就地解锁表单带 season/division。super 复用 `ADMIN_PASSWORD_HASH`。
- `admin-credentials`（新增）：`admin_credentials` 表 + migration + 后端 GET/PUT + super 专属
  改密码页与 server action（Next 侧 hash、scope `"*"` 门）。
