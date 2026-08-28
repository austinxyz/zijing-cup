# Contract — group 3: 导入命令：幂等写入、--check 与对账报告

- **Spec**: 系统 SHALL 提供一条导入命令，从总表导出的 CSV 写入名单。该命令 MUST 幂等：在同一份 CSV 上重复执行，数据库最终状态一致且不产生重复记录。CSV MUST NOT 提交到版本库。 / 导入命令 SHALL 提供 `--check` 模式：只比对数据库与 CSV，不做任何写入。一致时以退出码 0 结束；不一致时以非零退出码结束并指出差异所在的球队与球员。 / 总表在各 tab 之间并不自洽。导入 SHALL 产出对账报告，指出可疑之处而不是静默给出一份看起来完整的名单。报告 MUST 包含行数异常的球队；当同时提供了可选的排名表 CSV 时，MUST 另外列出有排名无名单与有名单无排名的球队。 / 版本库 MUST NOT 包含任何真实球员数据；测试数据 MUST 全部使用虚构姓名。 / 导入 MUST NOT 写入或清除由人工维护的字段，重复导入 MUST 保留它们已有的值；导入只拥有 CSV 携带的字段。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_import.py` → expected: 幂等、漂移检测、check 不写库、对账三节、同队重名报错的测试全部通过
- **Code**:
  - `parse → read → compare → write` 四步，`--check` 与写入**共用同一个比对函数**；两套比对逻辑会产生「check 说一致、导入却写了东西」（competition-rules 已踩过的形状，design.md D4）
  - 对账报告在两种模式下都产出——`--check` 也要能回答「数据源现在还对不对得上」
  - 排名表是**可选的第二个 CSV 参数**，只读来比对、不落表；这让「TPI 不入库」与「报出有排名无名单」不矛盾
  - 同队重名报错而非覆盖，且该批次不写入任何数据——这是快照语义唯一会被悄悄破坏的地方
  - 球队 code 原样存，不拆联队成分、不做别名归并（D5）
  - **比对与写入只覆盖 CSV 拥有的字段**。`is_borrowed_player`、`utr_profile_id`、以及 `Unrated` 行的 `rating_class` 由人工维护，导入器一次都不碰；`--check` 的比对同样忽略它们，否则人工设一个外援标记就会让漂移检测永远报红（design.md D1b）
- **Threshold**: 80
