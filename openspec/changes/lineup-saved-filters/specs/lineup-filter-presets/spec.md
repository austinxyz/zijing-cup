## Purpose

命名的排阵过滤预设（preset）的存取契约：把一支队当前的锁定与排除存成有名字、可列出、可
一键载入的集合。preset 是 admin-global 的（管理员存/删，任何人列出/载入），只存输入约束、
不存搜索结果，也不冻结任何 UTR。

## ADDED Requirements

### Requirement: preset 按队存储命名的输入约束
系统 SHALL 把每个 preset 存在 `zijing_cup` schema 的一张表里，按 (赛季, 组别, 队) 归属，
持有一个名字与一组**输入约束**（锁定 `{线: [keyA, keyB]}` 与排除 `[key]`）。preset MUST NOT
存搜索结果，MUST NOT 冻结任何 UTR——那是另一条 change 的事。约束以球队专属的球员 key
（`p<id>`）表达，与 URL 里那批参数同形。

#### Scenario: 存下当前约束
- **WHEN** 管理员在某队排阵页把当前锁定与排除存为一个命名 preset
- **THEN** 系统按 (赛季, 组别, 队) 存下这个 preset，持有它的名字与那组锁定/排除

#### Scenario: 只存输入不存结果
- **WHEN** 存一个 preset
- **THEN** 存下的是锁定与排除，不含任何候选阵容或 UTR 快照

### Requirement: preset 名在队内唯一且同名覆盖
同一 (赛季, 组别, 队) 内，preset 名 SHALL 唯一。存一个与已有 preset 同名的 preset 时，
系统 SHALL 覆盖旧的，而不是新建第二个同名条目。名字为空 SHALL 被拒。

#### Scenario: 同名覆盖
- **WHEN** 管理员用一个已存在的名字保存
- **THEN** 该名下的 preset 被新的锁定/排除覆盖，队内该名仍只有一个 preset

#### Scenario: 空名被拒
- **WHEN** 保存时名字为空
- **THEN** 请求被拒，不产生 preset

### Requirement: 存与删限管理员，列出对所有人开放
存与删 preset SHALL 是写操作，MUST 由既有的**按 HTTP 方法判权**的 admin 中间件保护——
无管理员凭据的存/删请求 MUST 被拒。列出某队的 preset SHALL 是只读的，不需要任何凭据。
鉴权 MUST NOT 依赖 `/api` 路由前缀或忘挂即敞开的依赖式检查。

#### Scenario: 无凭据的写被拒
- **WHEN** 没有管理员凭据的请求尝试存或删一个 preset
- **THEN** 请求被拒，preset 不被创建或删除

#### Scenario: 列出无需凭据
- **WHEN** 任何人（含未登录）请求某队的 preset 列表
- **THEN** 返回该队的 preset 列表

### Requirement: preset 不是新的信任入口
载入一个 preset SHALL 等价于把它的锁定/排除变成 URL query 参数后走**与手填 URL 完全相同**
的后端校验（未知 key → 4xx、旧格式 key → stale-link）。preset MUST NOT 能让搜索接受任何
一条裸 URL 接受不了的输入。名字是管理员手填文本，MUST 参数化入库、按普通用户输入对待。

#### Scenario: 载入走同一套校验
- **WHEN** 一个 preset 的约束被载入并触发搜索
- **THEN** 后端对这批约束的校验与手填同样参数的 URL 完全一致
