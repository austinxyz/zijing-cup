# player-notes Specification (delta: player-notes)

## Purpose
给一名球员记主观教练评价——优点、弱点、适合的搭档等——并让它随时间叠加（一条条追加、每条带时间），
日后排阵/裁决时回看。评价挂在球员上（跨赛季全局），是机密：只有解锁本比赛的人能看/写。只追加、可删，
不就地编辑（时间线保真）。

## ADDED Requirements

### Requirement: 评价按条存储，分类 + 文本 + 时间，追加式
系统 SHALL 有一张 `player_notes` 表（`zijing_cup` schema）：`id`、`player_id`（外键 players）、
`category`、`body`（文本）、`created_at`。`category` SHALL 限定为 `strength` / `weakness` / `partner` /
`other`（DB check 约束）。`created_at` SHALL 由数据库 `server_default now()` 且 NOT NULL 填入（不由应用
发显式值）。写入 SHALL 是**追加一条新记录**，MUST NOT 覆盖或就地修改既有记录。

#### Scenario: 追加不覆盖
- **WHEN** 对同一球员先后追加两条评价
- **THEN** 两条都存在，各有各的 created_at，第二条不覆盖第一条

#### Scenario: 类别受约束
- **WHEN** 写入一个不在 strength/weakness/partner/other 内的 category
- **THEN** 被数据库 check 约束拒绝

### Requirement: 读写评价的后端端点
系统 SHALL 提供：GET `/api/players/{id}/notes`（按 `created_at` 倒序返回该球员的评价）；POST
`/api/players/{id}/notes`（追加 `{category, body}`）；DELETE `/api/players/{id}/notes/{note_id}`（删一条）。
GET 在共享密钥中间件下需 `X-Backend-Secret`（只有 Next 服务端能取，故能在 canEdit 判定后安全取）；POST
与 DELETE 是写方法，中间件按方法**自动**要求 `X-Admin-Secret`（无需额外声明）。空 `body` SHALL 被拒。
MUST NOT 提供就地编辑一条评价的端点。

#### Scenario: 倒序返回
- **WHEN** GET 某球员的评价
- **THEN** 返回按 created_at 从新到旧排列

#### Scenario: 读需要后端密钥
- **WHEN** 不带 `X-Backend-Secret` 请求 GET
- **THEN** 被中间件拒（401）

#### Scenario: 写需要管理员密钥
- **WHEN** 带 `X-Backend-Secret` 但不带 `X-Admin-Secret` 请求 POST 或 DELETE
- **THEN** 被中间件拒（403）

#### Scenario: 空文本不写
- **WHEN** POST 的 body 为空/空白
- **THEN** 被拒，不新增记录

### Requirement: 详情右栏「评价」区，追加式时间线
队员详情右栏（`PlayerDetail`）SHALL 有「评价」区：顶部一个追加表单（类别下拉 + 文本框 + 追加按钮），
下面按时间倒序的时间线列表，每条显示类别标签（中文）、文本、时间、以及删除入口。删除 SHALL 就地确认后
才执行。空文本 MUST NOT 可提交。没有评价时 SHALL 呈现空态提示而非空白。类别在库里是英文 key，在界面
显示中文（strength→优点 / weakness→弱点 / partner→适合搭档 / other→其他）。

#### Scenario: 追加后出现在最上
- **WHEN** 选类别、输文本、点追加
- **THEN** 该条以类别标签 + 文本 + 时间出现在时间线最上方

#### Scenario: 删除需确认
- **WHEN** 点某条的删除
- **THEN** 出现就地确认（确认 / 取消）；确认后该条消失，其余不动；取消则不删

#### Scenario: 空文本不可追加
- **WHEN** 文本为空
- **THEN** 追加不可提交

### Requirement: 评价是机密，按比赛判权
评价 SHALL 按 `canEdit(season, division)` gate。页面 SHALL **仅在 canEdit 时**取评价并渲染评价区
（追加/删除入口）；未解锁本比赛者 MUST NOT 看到任何评价内容，页面 MUST NOT 发起取评价的请求（不把机密
塞进非管理员 HTML，同已存阵容）。写入经 `adminWrite` 按比赛 scope 判权。

#### Scenario: 未解锁看不到也不取
- **WHEN** 未解锁本比赛的人打开队员详情
- **THEN** 评价区不显示任何评价内容、无追加/删除入口，且不发起取评价的请求

#### Scenario: 解锁后可看可写
- **WHEN** 已解锁本比赛
- **THEN** 可看到评价时间线并能追加/删除
