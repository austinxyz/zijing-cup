## ADDED Requirements

### Requirement: 会话带作用域，编辑权限按比赛判
管理员会话 SHALL 携带一个作用域 `scope`：`"*"`（super，可编辑全部比赛）或
`"<season>:<division>"`（如 `2026:silver`，只能编辑该一个比赛）。`scope` MUST 进会话 cookie 的
**HMAC 签名载荷**——篡改 cookie 里的 scope SHALL 使签名失效、会话作废。

系统 SHALL 提供 `canEdit(season, division)` = `scope === "*" || scope === "<season>:<division>"`，
取代原来的全局「是否登录即可编辑」。所有决定「这个查看者能否编辑」的取值点 SHALL 改成按比赛判
（页面 `canEdit`、写控件显隐）。仅「是否持有有效会话」用 `isSignedIn()`（如 super 页门槛的第一层）。

#### Scenario: 比赛作用域只解锁对应比赛
- **WHEN** 会话 scope 为 `2026:silver`
- **THEN** `canEdit(2026, silver)` 为真；`canEdit(2026, gold)`、`canEdit(2025, silver)` 为假

#### Scenario: super 解锁全部
- **WHEN** 会话 scope 为 `"*"`
- **THEN** 任意 `canEdit(season, division)` 为真

#### Scenario: 篡改 scope 作废会话
- **WHEN** cookie 载荷里的 scope 被改动（签名未随之更新）
- **THEN** 会话读取返回 null（签名不匹配），等同未登录

### Requirement: 按比赛认证，super 复用现有密码
认证 SHALL 接收目标比赛 `authenticate(season, division, password)`：先按 super 口令
（复用现有 `ADMIN_PASSWORD_HASH` 环境变量）比对——命中发 scope `"*"`；否则取该比赛在
`admin_credentials` 里的 hash 比对——命中发 scope `"<season>:<division>"`；两者皆不中按原样失败
（沿用现有限速、错误反馈、失败关闭）。密码 hash 的计算与比对 SHALL 只在 Next 侧（`session.ts`
的 scrypt），明文密码 MUST NOT 到达后端。就地解锁表单 SHALL 携带 season/division，认证才知道
比的是哪个比赛。

某比赛在 `admin_credentials` 无密码行时，该比赛 SHALL 只能由 super 解锁（不是「无密码放行」）。

#### Scenario: 比赛密码命中
- **WHEN** 在 2026 银组页用该比赛的密码解锁
- **THEN** 认证成功、会话 scope = `2026:silver`

#### Scenario: super 密码在任意比赛命中
- **WHEN** 用 `ADMIN_PASSWORD_HASH` 对应的密码在任意比赛页解锁
- **THEN** 认证成功、会话 scope = `"*"`

#### Scenario: 无密码行的比赛只有 super 能进
- **WHEN** 某比赛 `admin_credentials` 无行，用非 super 密码解锁
- **THEN** 认证失败

### Requirement: 越权的写在前端被拒
`adminWrite` SHALL 知道目标比赛（赛季+组别），并在发请求前校验会话 scope 是否覆盖该比赛；
覆盖不了 SHALL 抛错且 MUST NOT 发出携带 `X-Admin-Secret` 的请求。后端不变（仍共享密钥 + 按方法
判权、不感知 scope）——scope 是前端会话概念，`adminWrite` 是唯一写入口，故前端强制足够。

#### Scenario: 跨比赛写被前端拦
- **WHEN** 会话 scope 为 `2026:silver`，尝试写 2026 金组的某资源
- **THEN** `adminWrite` 抛错、不发后端请求

#### Scenario: 作用域内写照常
- **WHEN** 会话 scope 为 `2026:silver`（或 `"*"`），写 2026 银组资源
- **THEN** `adminWrite` 照常带双密钥发请求
