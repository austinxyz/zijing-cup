# lineup-filter-presets Specification

## Purpose
命名的排阵过滤预设（preset）的存取契约：把一支队当前的锁定与排除存成有名字、可列出、可
一键载入的集合。preset 是 admin-global 的（管理员存/删，任何人列出/载入），只存输入约束、
不存搜索结果，也不冻结任何 UTR。

## Requirements

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

### Requirement: 载入阵型回填名字，按钮随名在「存为阵型/更新」间切换

载入(load)一套 preset 后,「阵型名」输入框 SHALL 自动填上该 preset 的名字,使「改约束再存回同一套」
不必手动重打原名。「存为阵型」按钮的文案 SHALL 由**当前输入的名字是否命中某个已存 preset 名**推导:命中
→ 显示「更新「<名>」」;否则 → 「存为阵型」;随用户改名实时切换(改新名→新建、改回原名→更新)。

保存路径 MUST NOT 改变:仍读**实时表单**约束(`constraintsFromForm`,不读 URL),同名保存复用既有「同名即
更新」语义(后端覆盖那套,不堆重复)。回填/文案是纯前端增强:载入链接 SHALL 多带一个 `preset=<名字>`(URL
编码)参数携带名字,`locks/pins/ex` 参数不变。回填 MUST NOT 覆盖用户正在输入的字(仅在载入的 preset 名变化时
seed)。保存/更新控件仍只在编辑模式(`canEdit && editing`)出现(现状不变)。

#### Scenario: 载入后名字回填
- **WHEN** 载入一套名为「主力」的 preset(编辑模式)
- **THEN** 「阵型名」输入框初值为「主力」,按钮显示「更新「主力」」

#### Scenario: 改约束后一键存回
- **WHEN** 载入「主力」→ 改一个锁定 → 点「更新「主力」」
- **THEN** 以「主力」+ 当前实时表单约束调 `savePreset`,覆盖那套(同名更新,不新建)

#### Scenario: 改成新名变新建
- **WHEN** 名字框里把「主力」改成一个未用过的名字
- **THEN** 按钮变回「存为阵型」,保存则新建一套

#### Scenario: 载入链接携带名字
- **WHEN** 生成某 preset 的载入链接(`buildLoadHref`)
- **THEN** 链接含 `preset=<URL 编码的名字>`,且 `locks/pins/ex` 参数不变

#### Scenario: 不覆盖正在输入
- **WHEN** 用户正在名字框打字(未再载入别的 preset)
- **THEN** 回填 effect 不触发、不覆盖用户输入
