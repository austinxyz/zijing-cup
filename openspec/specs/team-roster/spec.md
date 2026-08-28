# team-roster Specification

## Purpose
把组委会总表里的球队名单变成可查询的数据，取代「打开 Google Sheet 用眼睛找」。
名单按 `(赛季, 组别)` 存成快照——一名球员在 2025 银组和 2026 金组是两条互不相关的
记录，因为总表里没有任何能证明「这两行是同一个人」的字段，凭姓名归并会把它猜错。

导入是「比对后按差异写入」，只覆盖 CSV 拥有的列；外援标记、UTR 档案链接这类由人
手工维护的字段导入器一律不碰。读取端只有查询接口，没有写入端点——本项目不做
per-user 登录，一个公开的写接口等于谁都能覆盖所有队的名单。
## Requirements
### Requirement: 球队与名单按赛季与组别存储为快照
系统 SHALL 以 `(赛季, 组别)` 为维度存储球队与球员名单。一条名单记录是
**该赛季该队的一行快照**，其唯一键为 `(赛季, 组别, 球队, 姓, 名)`。
系统 MUST NOT 依据姓名把不同赛季或不同组别的记录自动归并为同一个人。

#### Scenario: 同一赛季两个组别各自独立
- **WHEN** 查询 2025 赛季金组与银组的球队
- **THEN** 两组各自返回自己的球队清单，互不包含

#### Scenario: 同名球员出现在两个组别
- **WHEN** 同一姓名同时出现在金组和银组的名单中
- **THEN** 两条记录各自独立存在
- **AND** 系统不声称它们是同一个人

#### Scenario: 同队重名必须报错而非覆盖
- **WHEN** 导入的数据在同一赛季同一组别同一球队内出现两个同姓同名的球员
- **THEN** 导入失败并指出冲突的球队与姓名
- **AND** 数据库未被写入任何该批次的数据

### Requirement: 名单记录保存参赛 UTR 及其来源依据
每条名单记录 SHALL 保存参赛 UTR、原始的 `DUTR Status` 文本、来源依据原文
（总表的 `Notes` 列）与取样窗口的每日 UTR 值。来源依据 MUST 原样保留，
MUST NOT 被规范化或丢弃 —— 它是判定评级类别与发起 UTR 追溯申诉的唯一凭据。

#### Scenario: 参赛 UTR 与来源依据一并返回
- **WHEN** 查询一名参赛 UTR 取自往届赛事的球员
- **THEN** 返回其参赛 UTR
- **AND** 返回来源依据原文（例如 `Zijing Cup 2024 UTR`）

#### Scenario: 每日 UTR 值作为取值证据保留
- **WHEN** 查询一名有取样窗口数据的球员
- **THEN** 返回该窗口内的每日 UTR 值序列

#### Scenario: 无来源依据的记录
- **WHEN** 某行的来源依据为空
- **THEN** 该字段存为空值，记录仍然写入
- **AND** 不以任何占位文本代替

### Requirement: 评级类别在可判定时判定，不可判定时留空
系统 SHALL 依据 `DUTR Status` 判定规则评级类别：`Rated` 为第 1 类已认证，
`Projected` 为第 2 类委员会审定。`Unrated` 的类别取决于该队员是否有 USTA 比赛
历史，该信息不在总表中，因此 MUST 留空待人工判定。系统 MUST NOT 为 `Unrated`
猜测一个类别。

#### Scenario: Rated 判定为已认证
- **WHEN** 导入一条 `DUTR Status` 为 `Rated` 的记录
- **THEN** 其规则评级类别为「已认证」

#### Scenario: Projected 判定为委员会审定
- **WHEN** 导入一条 `DUTR Status` 为 `Projected` 的记录
- **THEN** 其规则评级类别为「委员会审定」

#### Scenario: Unrated 留空待人工
- **WHEN** 导入一条 `DUTR Status` 为 `Unrated` 的记录
- **THEN** 其规则评级类别为空
- **AND** 其原始 `DUTR Status` 与来源依据原文都被保留，供人工判定使用

#### Scenario: 带 Appeal 后缀的状态
- **WHEN** 导入一条 `DUTR Status` 含 `/ Appeal` 后缀的记录
- **THEN** 原始状态文本被完整保留（含后缀）
- **AND** 其规则评级类别按后缀之前的状态词判定，`Unrated / Appeal` 同样留空

### Requirement: 名单记录可关联 UTR profile
名单记录 SHALL 可选携带 UTR profile ID。同一 profile ID 在同一赛季同一组别内
MUST 唯一；不同组别之间 MUST 允许重复，因为规则允许同一队员同时参加金组和银组。
未关联 profile ID 的记录 MUST 不受影响。

#### Scenario: 同组别内 profile ID 重复
- **WHEN** 在同一赛季同一组别内为两条记录关联同一个 UTR profile ID
- **THEN** 操作被拒绝

#### Scenario: 跨组别使用同一 profile ID
- **WHEN** 同一个 UTR profile ID 分别出现在同赛季的金组与银组记录上
- **THEN** 两条记录都被接受

#### Scenario: 未关联的记录正常可用
- **WHEN** 查询一支没有任何记录关联 profile ID 的球队名单
- **THEN** 名单正常返回，profile ID 字段为空

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

### Requirement: 名单条目记录外援身份
名单条目 SHALL 携带外援标记，默认为「未标注」。该字段 MUST NOT 由导入器填写
——组委会总表无法识别外援。规则对外援有名额与每场上场人数限制，未标注时
下游 MUST 视为「未知」而非「不是外援」。

#### Scenario: 导入的记录默认未标注
- **WHEN** 从 CSV 导入一批名单
- **THEN** 所有记录的外援标记为未标注

#### Scenario: 外援标记可被人工设置并读出
- **WHEN** 人工把某条记录标记为外援
- **THEN** 查询该队名单时该记录显示为外援

### Requirement: 从 CSV 导入名单且导入幂等
系统 SHALL 提供一条导入命令，从总表导出的 CSV 写入名单。该命令 MUST 幂等：
在同一份 CSV 上重复执行，数据库最终状态一致且不产生重复记录。
CSV MUST NOT 提交到版本库。

#### Scenario: 空库首次导入
- **WHEN** 在没有名单数据的库上导入 2025 赛季金组与银组的 CSV
- **THEN** 金组 6 支球队 120 名球员、银组 18 支球队 339 名球员落库

#### Scenario: 重复执行导入
- **WHEN** 在已导入的库上再次执行同一份 CSV 的导入
- **THEN** 命令成功退出且报告无变化
- **AND** 名单数据与首次导入后完全一致，没有重复行

#### Scenario: 修改后重新导入
- **WHEN** 修改 CSV 中某名球员的参赛 UTR 后重新导入
- **THEN** 该球员的参赛 UTR 更新
- **AND** 其余球队的记录未被改写

### Requirement: 导入命令提供只读的漂移检测模式
导入命令 SHALL 提供 `--check` 模式：只比对数据库与 CSV，不做任何写入。
一致时以退出码 0 结束；不一致时以非零退出码结束并指出差异所在的球队与球员。

#### Scenario: 数据库与 CSV 一致
- **WHEN** 在已导入且未改动 CSV 的情况下执行 `--check`
- **THEN** 退出码为 0

#### Scenario: CSV 改动但未导入
- **WHEN** 修改 CSV 后未执行导入即执行 `--check`
- **THEN** 退出码非 0
- **AND** 输出指出差异所在的球队与球员

#### Scenario: check 模式不写库
- **WHEN** 在存在差异的情况下执行 `--check`
- **THEN** 名单数据保持执行前的状态

### Requirement: 导入跳过非名单行并在报告中说明
导入 MUST 识别并跳过总表中的非名单行，MUST NOT 将其建为球队，且被跳过的行
MUST 出现在对账报告中。这些行来自合并单元格的脚注漏成数据行，`Team` 列取值为
`Borrowed Player` 或 `Unrated/Projected/Appeal`，内容是中文说明文字。

#### Scenario: 伪队名不进入球队表
- **WHEN** 导入包含 `Borrowed Player` 与 `Unrated/Projected/Appeal` 行的 CSV
- **THEN** 球队表中不存在这两个名称
- **AND** 对账报告列出这些被跳过的行

#### Scenario: 无法解析的行不静默丢弃
- **WHEN** CSV 中存在字段缺失或格式无法解析的行
- **THEN** 该行不写入数据库
- **AND** 对账报告列出该行及其无法解析的原因

### Requirement: 导入产出对账报告指出数据源的不一致
总表在各 tab 之间并不自洽。导入 SHALL 产出对账报告，指出可疑之处而不是
静默给出一份看起来完整的名单。报告 MUST 包含行数异常的球队；当同时提供了
可选的排名表 CSV 时，MUST 另外列出有排名无名单与有名单无排名的球队。

#### Scenario: 行数异常的球队被点出
- **WHEN** 某支球队在 CSV 中只有 1 条记录
- **THEN** 对账报告将该球队标为行数异常，提示人工核对
- **AND** 该球队及其记录仍照常导入（判断交给人，不由导入器代劳）

#### Scenario: 有排名无名单
- **WHEN** 导入时提供了排名表 CSV，且其中某支球队在名单 CSV 中没有任何记录
- **THEN** 对账报告将该球队列为「有排名无名单」

#### Scenario: 有名单无排名
- **WHEN** 导入时提供了排名表 CSV，且名单中某支球队不在排名表中
- **THEN** 对账报告将该球队列为「有名单无排名」

#### Scenario: 未提供排名表
- **WHEN** 导入时未提供排名表 CSV
- **THEN** 导入正常完成
- **AND** 对账报告不包含排名相关的两节，且不因此报错

#### Scenario: 排名表不入库
- **WHEN** 导入时提供了排名表 CSV
- **THEN** 排名与 TPI 数值不被写入任何表

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

### Requirement: 仓库不含真实球员数据
名单数据含真实校友姓名、性别与 UTR。版本库 MUST NOT 包含任何真实球员数据；
测试数据 MUST 全部使用虚构姓名。

#### Scenario: 名单 CSV 不被提交
- **WHEN** 在存放名单 CSV 的位置放入文件
- **THEN** 该文件被版本控制忽略

#### Scenario: 校验可自动执行
- **WHEN** 执行仓库的真实球员数据扫描
- **THEN** 在仓库干净时以零退出码结束

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

