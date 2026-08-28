## ADDED Requirements

### Requirement: 球队可有一个人工维护的显示名
球队 SHALL 可以带一个可选的中文显示名。该字段由人工维护，不来自名单 CSV，
因此名单导入 MUST NOT 写入或清除它。没有显示名的球队 MUST 以 code 呈现，
系统 MUST NOT 为其生成或推断一个名字——三校联队没有自然的中文叫法，凑一个
出来只会是错的。

#### Scenario: 有显示名的球队
- **WHEN** 查询一支已配置显示名的球队
- **THEN** 返回其 code 与显示名

#### Scenario: 没有显示名的球队
- **WHEN** 查询一支未配置显示名的球队
- **THEN** 返回其 code，显示名为空
- **AND** 系统不用 code 推导出一个名字来填充它

#### Scenario: 名单导入不覆盖显示名
- **WHEN** 为某球队配置显示名后，重新导入该组别的名单 CSV
- **THEN** 显示名保持不变
- **AND** 名单记录中来自 CSV 的字段照常按差异更新

#### Scenario: 漂移检测忽略显示名
- **WHEN** 数据库中球队带有显示名而名单 CSV 无此概念，执行名单导入的 `--check`
- **THEN** 该差异不被报告为漂移

### Requirement: 球队显示名由 seed 文件导入且导入幂等
球队显示名 SHALL 以 seed 文件为唯一事实来源，由一条导入命令写入数据库。
导入 SHALL 只写入差异，重复执行 MUST 得到一致的最终状态。导入命令 SHALL
提供只读的漂移检测模式。seed 中未列出的球队 MUST 保持无显示名，
MUST NOT 因未列出而报错——只有部分球队有自然的中文名。

#### Scenario: 首次导入写入显示名
- **WHEN** 在没有任何显示名的库上执行导入
- **THEN** seed 中列出的球队各自获得其显示名

#### Scenario: 重复导入无变化
- **WHEN** 在已导入的库上再次执行同一份 seed 的导入
- **THEN** 命令成功退出且报告无变化

#### Scenario: 改名后重新导入
- **WHEN** seed 中某球队的显示名被修改后重新导入
- **THEN** 该球队的显示名更新为新值

#### Scenario: 从 seed 中移除条目即清除显示名
- **WHEN** seed 中删除某球队的条目后重新导入
- **THEN** 该球队的显示名被清空
- **AND** 该球队本身与其名单记录不受影响

#### Scenario: seed 未覆盖的球队不报错
- **WHEN** seed 只列出部分球队
- **THEN** 导入成功，未列出的球队显示名为空

#### Scenario: seed 指向不存在的球队
- **WHEN** seed 中某条目的赛季、组别与 code 在库中找不到对应球队
- **THEN** 导入报告该条目未能匹配，而不是静默忽略

#### Scenario: 漂移检测
- **WHEN** 库中的显示名与 seed 不一致时执行 `--check`
- **THEN** 命令以非零退出码结束并指出差异

## MODIFIED Requirements

### Requirement: 人工维护的字段不被导入覆盖
导入 MUST NOT 写入或清除由人工维护的字段，重复导入 MUST 保留它们已有的值；
导入只拥有 CSV 携带的字段。人工维护的字段有四个：外援标记、UTR profile ID、
`Unrated` 记录被人工回填的评级类别，以及球队的显示名——它们都不来自 CSV。

#### Scenario: 重导不清除外援标记
- **WHEN** 人工把某条记录标记为外援后，用同一份 CSV 重新导入
- **THEN** 该记录仍然是外援
- **AND** 其来自 CSV 的字段照常按差异更新

#### Scenario: 重导不清除 UTR profile 关联
- **WHEN** 人工为某条记录关联 UTR profile ID 后重新导入
- **THEN** 该关联保持不变

#### Scenario: 重导不清除人工回填的评级类别
- **WHEN** 人工把某条 `Unrated` 记录的评级类别填为自评后重新导入
- **THEN** 该评级类别保持为自评
- **AND** 导入不因该记录的 `DUTR Status` 仍是 `Unrated` 而把它改回空

#### Scenario: 重导不清除球队显示名
- **WHEN** 球队已配置显示名后重新导入该组别的名单 CSV
- **THEN** 该显示名保持不变

#### Scenario: CSV 拥有的字段仍按差异更新
- **WHEN** CSV 中某记录的参赛 UTR 改变后重新导入
- **THEN** 该记录的参赛 UTR 更新
- **AND** 其外援标记、profile ID、人工回填的评级类别与所属球队的显示名都不受影响

#### Scenario: 漂移检测忽略人工字段
- **WHEN** 数据库中某条记录带有外援标记而 CSV 无此概念，执行 `--check`
- **THEN** 该差异不被报告为漂移

### Requirement: 提供按赛季组别查询球队与名单的只读端点
后端 SHALL 提供球队列表与球队名单两个只读端点。球队列表 SHALL 为每支球队
带出名单人数与按性别的人数分布；性别为空的记录 MUST 单独计数，MUST NOT
并入任一性别。两个端点 SHALL 带出球队的显示名（未配置时为空）。系统
MUST NOT 提供任何修改名单或球队的 HTTP 端点 —— 本项目没有 per-user 登录，
公开可写的入口意味着任何人都能覆盖全部球队数据。

#### Scenario: 查询球队列表
- **WHEN** 请求某个存在的赛季组别的球队列表
- **THEN** 返回 200 与该组别的球队清单
- **AND** 每支球队带有总人数、按性别的人数分布与显示名

#### Scenario: 性别分布与总数自洽
- **WHEN** 读取球队列表中任一球队的人数
- **THEN** 男、女与性别未填三项之和等于该球队的总人数

#### Scenario: 查询球队名单
- **WHEN** 请求某支存在球队的名单
- **THEN** 返回 200 与该队全部名单记录，含参赛 UTR、原始状态、评级类别、来源依据与外援标记
- **AND** 响应带有该球队的 code 与显示名

#### Scenario: 未知球队
- **WHEN** 请求一支不存在的球队的名单
- **THEN** 返回 404 而非空列表

#### Scenario: 未知赛季或组别
- **WHEN** 请求不存在的赛季或组别代码
- **THEN** 返回 404

#### Scenario: 不存在名单的写方法
- **WHEN** 检查应用暴露的 HTTP 接口
- **THEN** 不存在任何指向名单或球队资源的 POST / PUT / PATCH / DELETE 方法
