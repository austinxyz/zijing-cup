## ADDED Requirements

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
