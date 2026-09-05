## ADDED Requirements

### Requirement: 按比赛存密码凭据
系统 SHALL 有一张 `admin_credentials` 表（`zijing_cup` schema）：`season_year`、`division_code`、
`password_hash`、`updated_at`，`(season_year, division_code)` 唯一。`password_hash` 是 Next 侧 scrypt
产出的 `salt:hash` 字符串——后端只存/回字符串，MUST NOT 在后端计算或校验密码，明文绝不入库。

#### Scenario: 每个比赛至多一行
- **WHEN** 对同一 `(season, division)` 写两次
- **THEN** 第二次是更新（upsert），不是新增行

### Requirement: 后端读写比赛密码 hash 的端点
系统 SHALL 提供：GET 读某比赛的 `password_hash`（无行时 404）；PUT upsert 某比赛的
`password_hash`。两者都在共享密钥中间件下——GET 需 `X-Backend-Secret`（只有 Next 服务端持有，
故用户认证之前也只有它能取到 hash）；PUT 是写方法，另需 `X-Admin-Secret`（按方法判权自动覆盖，
无需额外声明）。

#### Scenario: 只有 Next 服务端能读 hash
- **WHEN** 不带 `X-Backend-Secret` 请求 GET
- **THEN** 被中间件拒（401）

#### Scenario: 写需要管理员密钥
- **WHEN** 带 `X-Backend-Secret` 但不带 `X-Admin-Secret` 请求 PUT
- **THEN** 被中间件拒（403）

### Requirement: super 专属改密码界面
系统 SHALL 提供一个仅 super 可用的改密码页：选赛季/组别 + 输新密码 → server action 先校验会话
scope 为 `"*"` → 在 Next 侧算 scrypt hash → PUT 写入 `admin_credentials`。非 super（scope 非 `"*"`）
SHALL 既打不开该页、其 server action 也 MUST 拒绝执行（不发 PUT）。写入后该比赛旧密码立即失效
（同一行被覆盖）。

#### Scenario: super 设置某比赛新密码
- **WHEN** super 在改密码页给 2026 金组设新密码并保存
- **THEN** `admin_credentials` 里该比赛 hash 被更新，之后金组只认新密码、旧密码失败

#### Scenario: 非 super 调不动
- **WHEN** scope 为 `2026:silver` 的会话调用改密码 server action
- **THEN** 被拒、不写 DB
