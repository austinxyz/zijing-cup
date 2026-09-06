# admin-access Specification

## Purpose
本项目第一个写接口的防护。此前只有一个共享密钥，它证明「请求来自我们的服务器」，
不证明「这是谁」——一旦有了写路由，这个区别就是安全边界。

两层，形状一致且都是**减法式**的：中间件按 HTTP 方法判定，写方法一律要求
`X-Admin-Secret`，因此明天新加的写路由不声明任何东西就已经受保护。缺失的密钥意味着
谁都进不来，不是谁都能进。身份在 Next 侧建立（口令哈希 + 签名的 httpOnly cookie），
两个密钥都只在服务端读取。

不做多角色。只有一个管理员；队长/球员分级权限仍是需要重新设计的事，不在这层上打补丁。

## Requirements

### Requirement: 写接口默认拒绝
所有修改数据的路由 SHALL 要求管理员凭据（`X-Admin-Secret`）。这个检查 MUST 沿用现有
共享密钥中间件的形状——**减法式**覆盖：新加的写路由不声明任何东西就已经受保护，
而不是「记得挂上依赖才受保护」。

`ADMIN_SECRET` 未配置时，系统 SHALL 拒绝**全部**写请求。缺失的密钥 MUST 意味着「谁都
进不来」，MUST NOT 意味着「谁都能进」。

读路由 MUST NOT 因此改变：它们继续只要求现有的共享密钥。

#### Scenario: 不带管理员凭据的写请求
- **WHEN** 向任一写路由发请求且不带 `X-Admin-Secret`
- **THEN** 返回 401 或 403，且数据没有被修改

#### Scenario: 未配置密钥时全部拒绝
- **WHEN** `ADMIN_SECRET` 环境变量不存在，向写路由发请求（哪怕带着某个值）
- **THEN** 请求被拒绝

#### Scenario: 新加的写路由自动受保护
- **WHEN** 新增一条写路由且没有为它显式声明任何鉴权
- **THEN** 它同样要求 `X-Admin-Secret`

#### Scenario: 读路由不受影响
- **WHEN** 用现有共享密钥请求任一读路由
- **THEN** 照常返回数据，不要求管理员凭据

### Requirement: 管理员通过登录获得会话，凭据不进浏览器
浏览器 SHALL 通过 Next 的登录页以口令换取会话，会话 SHALL 存在 **httpOnly** cookie 中。
`BACKEND_SECRET` 与 `ADMIN_SECRET` MUST NOT 出现在客户端 bundle 里——写操作在服务端
（Server Action / Route Handler）校验会话之后，才带着这两个密钥调用 FastAPI。

口令 MUST NOT 以明文形式存储，SHALL 以哈希形式配置。

#### Scenario: 登录成功后拿到会话
- **WHEN** 管理员输入正确口令
- **THEN** 服务端下发 httpOnly 会话 cookie
- **AND** 之后的写操作被允许

#### Scenario: 口令错误
- **WHEN** 输入错误口令
- **THEN** 不下发会话，且页面显示失败原因与剩余尝试次数

#### Scenario: 未登录不能写
- **WHEN** 没有有效会话的情况下触发一次写操作
- **THEN** 操作被拒绝，且客户端得到「需要登录」而不是一个通用错误

#### Scenario: 密钥不在浏览器里
- **WHEN** 检查客户端 bundle
- **THEN** 其中不含 `BACKEND_SECRET` 与 `ADMIN_SECRET`

### Requirement: 会话会过期，登录失败会被限速
会话 SHALL 有有效期，过期后写操作 SHALL 被拒绝并要求重新登录。连续登录失败 SHALL 被
限速，且**剩余尝试次数或解锁时间要呈现在界面上**——限速只在后端存在而前端不说，用户
会以为是自己手滑，反复重试直到被锁。

#### Scenario: 会话过期后写被拒
- **WHEN** 会话已过期，管理员触发一次写操作
- **THEN** 操作被拒绝并提示重新登录

#### Scenario: 连续失败被限速且界面说明
- **WHEN** 连续多次输入错误口令
- **THEN** 进一步的尝试被限速
- **AND** 界面显示还能试几次或需要等多久

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
