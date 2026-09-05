## ADDED Requirements

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
