# Contract — group 3: TOML seed 与幂等导入命令

- **Spec**: 系统 SHALL 提供一条导入命令，把 TOML seed 文件的内容写入数据库。该命令 MUST 是幂等的：在同一份 seed 文件上重复执行，数据库最终状态一致，且不产生重复记录。 / 导入命令 SHALL 提供 `--check` 模式：只比对数据库与 seed 文件，不做任何写入。一致时以退出码 0 结束；不一致时以非零退出码结束，并指出存在差异的赛季、组别与字段。
- **Runtime**: `cd backend && uv run pytest tests/test_seed_rules.py` → expected: 幂等、漂移检测、check 不写库三类测试全部通过
- **Code**:
  - 实现分三步：解析 seed → 读 DB 当前状态 → 计算差异；`--check` 与写入模式**共用同一个比对函数**，否则会出现「check 说一致、导入却写了东西」（design.md D3）
  - 不用 `ON CONFLICT DO UPDATE` 无脑覆盖 —— 那样无法回答「有没有变」，`--check` 得另写一套逻辑
  - seed 中不存在但 DB 中存在的行按删除处理，使 seed 成为唯一事实来源；删除前打印将删除的行数与内容
  - TOML 用标准库 `tomllib` 读取，不新增依赖
- **Threshold**: 80
