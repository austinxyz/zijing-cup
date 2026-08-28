### Contract
- **Spec**:
  - 球队 SHALL 可以带一个可选的中文显示名。该字段由人工维护，不来自名单 CSV，
    因此名单导入 MUST NOT 写入或清除它。没有显示名的球队 MUST 以 code 呈现，
    系统 MUST NOT 为其生成或推断一个名字。
  - 导入 MUST NOT 写入或清除由人工维护的字段，重复导入 MUST 保留它们已有的值；
    导入只拥有 CSV 携带的字段。人工维护的字段有四个：外援标记、UTR profile ID、
    `Unrated` 记录被人工回填的评级类别，以及球队的显示名。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_model.py tests/test_roster_models_roundtrip.py tests/test_roster_import.py` → expected: 全部通过；新增的显示名字段归属测试在实现前先红
- **Code**:
  - migration 必须 schema-qualified 或以 `set search_path to zijing_cup, public;` 开头；
    列可空且**无默认值**（未配置 ≠ 空字符串）。
  - 名单导入会 upsert `teams` 行 —— 必须显式只写它拥有的字段。写错就会在每次导入
    名单时静默清空所有显示名。
  - 字段归属测试必须导入一份**有差异**的 CSV，不能导无差异的：无差异时导入器根本
    不写，测试会空转（`roster-import` 有三个字段归属测试曾因此假通过）。
- **Threshold**: 80
