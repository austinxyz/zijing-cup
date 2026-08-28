### Contract
- **Spec**:
  - 球队显示名 SHALL 以 seed 文件为唯一事实来源，由一条导入命令写入数据库。
    导入 SHALL 只写入差异，重复执行 MUST 得到一致的最终状态。导入命令 SHALL
    提供只读的漂移检测模式。seed 中未列出的球队 MUST 保持无显示名，
    MUST NOT 因未列出而报错。
- **Runtime**: `cd backend && uv run pytest tests/test_team_names.py` → expected: 新增测试全部通过，含首次导入、幂等、改名、移除即清空、未覆盖不报错、未匹配条目被报告、`--check` 漂移检出
- **Code**:
  - 沿用 `load_rules` 的形态：解析 → 读库 → 比对 → 只写差异，`--check` 复用
    同一个比对函数并转成退出码。不要写第二套比对逻辑。
  - **从 seed 中消失的条目按清空处理** —— 否则 seed 成了只增不减的叠加，
    不再是事实来源。这与规则 seed 的语义一致。
  - seed 指向不存在的球队要**报告未匹配**，不是静默忽略、也不是报错退出：
    先导名单再导显示名是正常顺序，但拼错 code 必须被看见。
  - CLI 输出含中文，需 `configure_stdout()`（Windows cp1252 会崩）。
- **Threshold**: 80
