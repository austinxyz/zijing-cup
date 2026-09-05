## Context

现状（读自代码）：`lib/session.ts` 用单一 `ADMIN_PASSWORD_HASH`（scrypt `salt:hash`）做
`checkPassword`；会话是 HMAC 签名的 httpOnly cookie，载荷仅 `{issuedAt, expiresAt}`，无身份。
`lib/admin.ts` 的 `isSignedIn()` = 有有效会话 → 全局可编辑；`adminWrite(method, path, body)` 带
`BACKEND_SECRET` + `ADMIN_SECRET` 调后端；后端 `auth.py` 中间件按 HTTP 方法判权（写需
`X-Admin-Secret`），**不做分级**。`login/actions.ts` 的 `authenticate` 是 `login`（redirect）与
`unlockAdmin`（就地 `{ok}`）共用的核心。各页 `canEdit = await isSignedIn()`；players layout 未登录
`redirect("/login")`。

## Goals / Non-Goals

**Goals**: 按比赛（赛季+组别）分密码，各自只解锁对应比赛；super（复用现有 env）解锁全部；改密码
走 super 专属页；scope 前端强制、后端不变。

**Non-Goals**: 后端分级 / 多用户账号 / 密码找回；super 轮换仍改 env。

## Decisions

### D1 — scope 进签名载荷，`"*"` 或 `"season:division"`
`Session` 加 `scope: string`。`issueSession(scope)` 把 scope 放进 base64 载荷再 HMAC 签名；
`readSession` 解出并返回。篡改 scope 必然改动载荷 → 签名不匹配 → null。scope 取值：super = `"*"`，
比赛 = `` `${season}:${division}` ``（division_code 已是 kebab、无冒号，安全）。
- *备选*：单独存一个 scope cookie —— 弃，未签名可篡改。

### D2 — `authenticate(season, division, password)` 三分支，super 复用现有 env
顺序：① `checkPassword(password)`（现有函数，比 `ADMIN_PASSWORD_HASH`）命中 → scope `"*"`；
② 取该比赛 DB hash（见 D3）比 → 命中 scope `"season:division"`；③ 皆不中 → 失败（现有限速/反馈/
失败关闭不动）。限速在密码比对**之前**（同现状），三分支都算一次尝试。hash 只在 Next 侧算/比。
- *备选*：先比赛后 super —— 无实质差别，选 super 优先（负责人最常用、且 env 恒在）。

### D3 — 比赛 hash 走后端 GET，`checkCompetitionPassword` 只读
新 `lib/session.ts` 函数 `checkCompetitionPassword(season, division, password)`：`fetch` 后端
`GET /api/seasons/{y}/divisions/{c}/admin-credential`（带 `BACKEND_SECRET`），拿 `password_hash`
（404 → 无密码行 → false），用与 `checkPassword` 同一段 scrypt+timingSafe 比对。读发生在用户认证
**之前**，只能靠 `X-Backend-Secret`（服务端持有）护——非 Next 调用方本就打不到后端。**取 hash 失败
（表未建/网络）→ 视作无密码行（false）**，即迁移前该比赛只有 super 能进，不 500、不放行。
- 复用比对逻辑：把现有 `checkPassword` 的 scrypt 比对抽成 `matches(hash, password)`，super 与比赛
  两路共用，避免两份 timing-safe 比对漂移。

### D4 — `canEdit(season, division)` + `adminWrite` 显式收目标比赛
`lib/admin.ts` 加 `canEdit(season, division)`：读会话 scope，`"*"` 或等于该比赛 → true。`adminWrite`
**新增显式参数** `scope: {season, division} | "super-only"`（不靠解析 path——path 形状易变、解析脆）：
发请求前 `assertScope`，会话 scope 覆盖不了目标即抛 `NotAuthorizedForCompetition`、不发请求。
`"super-only"` 用于改密码 PUT（要求 scope `"*"`）。各既有写 server action 已绑定 (season,division)，
把它传给 `adminWrite` 即可。
- *备选*：`adminWrite` 解析 path 里的 `/seasons/{y}/divisions/{c}/` —— 弃，脆且有非比赛路由。

### D5 — 后端：`AdminCredential` 模型 + GET/PUT，中间件零改动
`app/models/` 加 `AdminCredential`（表 `admin_credentials`，`(season_year, division_code)` 唯一，
`password_hash text`，`updated_at` server_default）。新路由：GET 读 hash（404 无行）、PUT upsert。
方法判权中间件已覆盖（GET 需 X-Backend-Secret、PUT 另需 X-Admin-Secret），`auth.py` 不动。后端只
存/回字符串，绝不算 hash。migration 以 `set search_path to zijing_cup` 开头。

### D6 — super 专属改密码页 + 就地按比赛解锁
新页（super-only）：选赛季/组别 + 输新密码 → server action `setCompetitionPassword(season,
division, password)`：先断言会话 scope `"*"`（非 super 抛错、不写）→ Next 侧 `hashPassword` →
`adminWrite("PUT", ".../admin-credential", {password_hash}, "super-only")`。页面本身 server 组件先
`isSignedIn()` 且 scope `"*"` 才渲染表单，否则提示。就地解锁表单（`EditModeToggle` 及
`LineupEditHeaderControl`/`TeamEditHeaderControl` 里那个）加 season/division 隐藏字段传给
`unlockAdmin`。players layout 从 `redirect("/login")` 改为按比赛就地解锁（未 canEdit 显示解锁而非
跳走）；`/login` 保留为 super 入口（无比赛上下文 → 只认 super 口令 → scope `"*"`）。

## Risks / Trade-offs

- [scope 仅前端强制，后端仍接受任何带 `X-Admin-Secret` 的写] → 可接受：只有 Next 服务端持
  `ADMIN_SECRET`，`adminWrite` 是唯一写入口且按 scope 拒；与「后端共享密钥、不分级」的既定架构一致
  （CLAUDE.md 明确后端不打分级补丁）。真要后端分级是另一个 change。
- [比赛 hash 的 GET 用 X-Backend-Secret 而非 admin] → 必须如此：登录前就要读它比对；只有 Next 有该
  密钥，非 Next 打不到。
- [迁移前读 hash 失败] → 降级为「无密码行」：该比赛只 super 能进，不 500、不放行（失败关闭）。
- [super 复用 `ADMIN_PASSWORD_HASH`] → 负责人现有密码即 super，向后兼容；轮换 super 仍改 env。
- [migration 未跑远程即 push] → 后端读 `admin_credentials` 的新路由/新表 500。**push 前先 Dashboard
  执行**；前端 `checkCompetitionPassword` 对读失败降级，但后端 PUT/GET 路由本身需表存在。

## Migration Plan

1. `supabase/migrations/<ts>_create_admin_credentials.sql`：`set search_path to zijing_cup, public;`
   + `create table admin_credentials (season_year int not null, division_code text not null,
   password_hash text not null, updated_at timestamptz not null default now(),
   unique(season_year, division_code));`（按需加 FK 到 seasons/divisions，或留松——密码行可能先于
   division 存在，设计倾向不加 FK，用应用层保证）。
2. 本地：断言连接串含 127.0.0.1 后打到本地栈。
3. 远程：Dashboard SQL Editor 手工执行，**先执行、后 push 后端**。
4. 回滚：`drop table admin_credentials;`（无其他表依赖它）。

## Open Questions

（无——scope 编码、三分支认证、GET/PUT + 中间件零改、adminWrite 显式 scope、super 页与就地解锁、
FK 从松均已定。）
