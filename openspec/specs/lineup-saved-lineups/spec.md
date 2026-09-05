# lineup-saved-lineups Specification

## Purpose
已存阵容的存取契约：把一套选定的 10 人阵容（线位分配）连同当时的参赛 UTR 快照存下来，之后用
**当前** UTR 重判它是否还合法。存储是 admin-global、按 (赛季,组别,队)；重判与就地编辑的实时判
都复用引擎的 `check_lineup`，不复制合法性逻辑；快照只读、绝不回写任何人的参赛 UTR。

## Requirements

### Requirement: 按队存储命名阵容与 UTR 快照
系统 SHALL 把每套已存阵容存在 `zijing_cup` schema 的表里，按 (赛季,组别,队) 归属，持有名字、
**线位分配**（`{线: [keyA, keyB]}`）与保存时每名队员参赛 UTR 的**快照**（`{key: match_utr 字符串}`）。
快照 SHALL 只读留存，MUST NOT 回写参赛 UTR、MUST NOT 影响排阵引擎的真实取数——它只供「当时 vs
现在」的对比。同队内名 SHALL 唯一；同名保存 SHALL 覆盖。

#### Scenario: 存下一套阵容与快照
- **WHEN** 管理员从候选结果行保存一套阵容
- **THEN** 系统按队存下它的名字、10 人线位分配与当前每人参赛 UTR 快照

#### Scenario: 快照不回写
- **WHEN** 保存一套阵容
- **THEN** 队员的参赛 UTR 不被改动，排阵引擎后续取数仍取当前真实值

#### Scenario: 同名覆盖
- **WHEN** 管理员用一个已存在的名字保存
- **THEN** 该名下的阵容被覆盖，队内该名仍只有一套

### Requirement: 存删存回限管理员，列出与重判开放
存、删、存回（覆盖）SHALL 是写操作，MUST 由既有的按 HTTP 方法判权的 admin 中间件保护——无管理员
凭据的写请求 MUST 被拒。列出某队已存阵容并重判 SHALL 是只读（GET）、无需凭据。校验一套 assignment
的端点 SHALL 是 POST（body 带 5 线 assignment），因而被方法判权中间件要求 admin，这与编辑是 admin
动作一致。鉴权 MUST NOT 依赖路由前缀或依赖式检查。

#### Scenario: 无凭据写被拒
- **WHEN** 没有管理员凭据的请求尝试存、删或存回一套阵容
- **THEN** 请求被拒，数据不变

#### Scenario: 列出与重判无需凭据
- **WHEN** 任何人请求某队的已存阵容列表
- **THEN** 返回列表，每套带用当前 UTR 重判的状态

### Requirement: 服务端用当前 UTR 重判四态
列出已存阵容时，系统 SHALL 对每套用**当前**参赛 UTR 解析成 `Candidate` 后跑 `check_lineup`，给出
状态之一：仍合法 / UTR 动了但仍合法 / 已非法（带 `check_lineup` 的 violations，点名卡哪条约束）/
有人已不在名单（key 解析不到当前 `match_utr`）。系统 SHALL 一并给出逐人**快照 vs 当前**的 UTR 差异。
有人离队的阵容 MUST NOT 被判为合法，MUST NOT 静默丢人。

#### Scenario: UTR 动了仍合法
- **WHEN** 某队员参赛 UTR 在保存后变化、但重判仍合法
- **THEN** 状态标「UTR 动了仍合法」，并点名该队员从旧值到新值

#### Scenario: 变非法点名卡哪条
- **WHEN** 保存后的 UTR 变化使某套阵容非法
- **THEN** 状态标「已非法」，带 violations 指出卡哪条约束

#### Scenario: 有人离队
- **WHEN** 一套阵容里某队员已不在当前名单
- **THEN** 状态标「有人离队」，不呈现为合法

### Requirement: 校验一套 assignment 复用 check_lineup
校验端点 SHALL 接收一套 5 线 × 2 key 的 assignment，用**当前**参赛 UTR 解析后跑既有 `check_lineup`
并回 violations（结构化、复用既有 `Violation` 的中文 message）。系统 MUST NOT 复制一份合法性判定
逻辑。引用的 key 走与手填 URL 完全相同的校验（未知 key → 4xx、旧格式 → stale-link）；同一人被放到
两处等冲突由 `check_lineup` 的 violations 据实报出，MUST NOT 预先拦阻。

#### Scenario: 校验一套合法 assignment
- **WHEN** 提交一套当前 UTR 下合法的 assignment
- **THEN** 返回空 violations

#### Scenario: 校验一套非法 assignment
- **WHEN** 提交一套超 cap / 超 buffer / 超差距 / 重复上场 / 资格违规的 assignment
- **THEN** 返回对应的 violations，点名卡哪条

### Requirement: 已存阵容有可编辑顺序
每个已存阵容 SHALL 带一个整数 `sort_order`。列表 SHALL 按 `(sort_order 升序, id 升序)` 返回，
取代按 `name` 排序。新存的阵容 SHALL 取该队现有 `sort_order` 的最大值 +1（排在末尾）。
`sort_order` 随 `SavedLineupOut` 带出。迁移现有行时 SHALL 按原 `name` 顺序回填，使切换后
现有顺序不变。

#### Scenario: 列表按 sort_order 返回
- **WHEN** 一队有多个已存阵容、`sort_order` 各不相同
- **THEN** 列表按 `sort_order` 升序返回（id 兜底），不再按 name

#### Scenario: 新存排在末尾
- **WHEN** 存一个新阵容
- **THEN** 其 `sort_order` = 该队现有最大值 +1

### Requirement: 重排接收整份有序 id 列表
重排 SHALL 接收该队已存阵容的**整份有序 id 列表**，按列表位置写各行的 `sort_order`。
SHALL 幂等：再次发同一列表产生 0 处改动。列表与该队当前 id 集合不一致时（含别队 id、缺项、
或有重复）SHALL 整体拒绝（422）且不写任何一行——不写一半。仅由方法判权中间件保护的写端点
可达。

#### Scenario: 按位置写顺序
- **WHEN** 发来 `[c, a, b]`（均为该队 id）
- **THEN** c/a/b 的 `sort_order` 依次为 0/1/2，列表随后按此序返回

#### Scenario: 幂等
- **WHEN** 对已是 `[c, a, b]` 顺序的队再发 `[c, a, b]`
- **THEN** 0 处改动

#### Scenario: 坏列表整体拒绝
- **WHEN** 列表含一个别队 id，或漏掉该队某个 id
- **THEN** 返回 422，该队顺序不变

### Requirement: 克隆一个已存阵容
克隆 SHALL 新建一行，`assignment` 与 `utr_snapshot` 与源**逐字节相等**（真拷贝，不按当前 UTR
重新快照）。新名字 SHALL 为 `<原名> 副本`；若该队已存在同名，则 `<原名> 副本2`、`副本3`…
（`(team_id, name)` 唯一，必须去重）。新行 `sort_order` 排在末尾。克隆 SHALL 计入该队 50 条
上限：达上限时拒绝（409）。仅由方法判权中间件保护的写端点可达。

#### Scenario: 逐字节复制
- **WHEN** 克隆一个已存阵容
- **THEN** 新行的 `assignment`/`utr_snapshot` 与源相等，名字为 `<原名> 副本`，排在末尾

#### Scenario: 重名去重
- **WHEN** `<原名> 副本` 已存在
- **THEN** 新名字为 `<原名> 副本2`（再冲突则 `副本3`…）

#### Scenario: 命中上限
- **WHEN** 该队已有 50 条已存阵容
- **THEN** 克隆返回 409，不新建行
