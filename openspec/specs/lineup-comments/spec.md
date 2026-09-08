# lineup-comments Specification

## Purpose
给已存阵容（`saved_lineups`）记追加式评论——「这套打谁用、为什么这么排、注意哪条线」——与球员评价
（`player-notes`）对称：队员看 note，阵容看评论。纯自由文本、追加式、可删、不就地编辑；已存阵容本就是
管理员机密，评论随其同门。

## Requirements

### Requirement: lineup_comments 表

系统 SHALL 有一张 `lineup_comments` 表：`saved_lineup_id` FK → `saved_lineups(id)` `on delete cascade`；
`body` text（长度 1–2000，DB CHECK）；`created_at` server_default now() NOT NULL。写入 SHALL 追加、
MUST NOT 覆盖。删阵容 SHALL 级联删其评论。

#### Scenario: 删阵容级联删评论
- **WHEN** 删除一个 saved_lineup
- **THEN** 其所有 lineup_comments 一并删除（FK cascade）

### Requirement: GET/POST/DELETE + 批量读端点

系统 SHALL 提供：单阵容 GET 列出（倒序 `created_at desc, id desc`）、POST 追加、DELETE 删一条（按
saved_lineup_id + comment id）；以及批量读端点 `GET /api/…/lineup-comments?ids=…`，按 saved_lineup_id 分组
返回、只放有评论的 id、ids 去重/忽略非法/clamp、空 ids → 空映射。GET 需 X-Backend-Secret；POST/DELETE 按
方法自动需 X-Admin-Secret。空 body 拒；超长（>2000）拒为 422（不落 500）。MUST NOT 提供就地编辑端点。

#### Scenario: 批量倒序分组
- **WHEN** 两套阵容各有评论，`GET …/lineup-comments?ids=a,b`
- **THEN** 返回 `{a:[…倒序], b:[…]}`，无评论的 id 不占键

#### Scenario: 空 body 拒、超长 422
- **WHEN** POST 一条空白 body，或 >2000 字的 body
- **THEN** 分别 422，不写入、不落 500

#### Scenario: 鉴权
- **WHEN** GET 无 X-Backend-Secret / POST 或 DELETE 无 X-Admin-Secret
- **THEN** 分别 401 / 403（方法判权中间件）

#### Scenario: 跨阵容不可删
- **WHEN** DELETE 用正确 comment id 但 saved_lineup_id 是别的阵容
- **THEN** 404，不删

### Requirement: 卡片内可展开评论区

已存阵容卡片 SHALL 有一个可展开「评论 N ▾」区：折叠态显示计数，点开显示倒序时间线（文本 + 时间 +
删除）+ 追加框。追加/删除 SHALL 只在编辑模式（`canEdit && editing`）可见可用；查看模式只读（无追加框、
无删除）。空文本 MUST NOT 可提交；写失败就地报错。评论经既有 `adminWrite`（按比赛 scope）写、成功
`revalidatePath` 刷新。

#### Scenario: 编辑模式追加/删除
- **WHEN** 已解锁 + 编辑模式，展开某卡片评论区，填文本点追加 / 点某条删除并确认
- **THEN** 追加调 `addLineupComment`、删除调 `deleteLineupComment`（均 scope `{season,division}`），成功后刷新

#### Scenario: 查看模式只读
- **WHEN** 已解锁但查看模式（或展开评论区）
- **THEN** 只显示倒序时间线，无追加框、无删除按钮

### Requirement: 机密随已存阵容 + 批量取 + 失败降级

评论 SHALL 只在能看到已存阵容时可见——已存阵容仅 `canEdit` 时取数渲染（现状），评论随卡片一起，未解锁
既看不到阵容也看不到评论。一屏多卡 SHALL 用一次批量请求取回评论。`getLineupCommentsBatch` 失败 SHALL
降级为 `{}`（评论区不显示计数/内容），已存阵容卡片主体照常。

#### Scenario: 未解锁看不到
- **WHEN** 未解锁本比赛
- **THEN** 不显示已存阵容，也不显示任何评论、不发批量取评论请求

#### Scenario: 批量取失败降级
- **WHEN** 批量取评论失败（如远程表未建）
- **THEN** 评论区降级为空（计数 0 / 无内容），已存阵容卡片主体与重判照常，不整页报错

### Requirement: 克隆不复制评论

克隆一套已存阵容 MUST NOT 复制原阵容的评论——克隆得到新 saved_lineup id，其评论为空。评论是对原阵容的
批注，克隆是拿去改的新阵容。

#### Scenario: 克隆得到空评论
- **WHEN** 克隆一套有评论的阵容
- **THEN** 新阵容的评论为空；原阵容的评论不变
