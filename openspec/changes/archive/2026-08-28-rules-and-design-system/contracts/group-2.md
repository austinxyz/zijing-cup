# Contract — group 2: 赛制规则数据模型与 migration

- **Spec**: 系统 SHALL 将各线 UTR Cap、Buffer 额度、各线分值、上场资格阈值与胜负判定方式，以 `(赛季, 组别)` 为维度存储为数据。这些值 MUST NOT 以代码常量的形式出现在后端或前端源码中。 / 系统 SHALL 允许一条线没有 UTR 上限（金组的 D1 与 MD）。无上限 MUST 表达为「不存在上限」（cap 为 null），MUST NOT 用一个足够大的数值代替。 / 系统 SHALL 同时存储 Buffer 的「单线最大超出量」与「全队超出量总额」两个额度。 / 系统 SHALL 将上场资格限制存储为一组规则，每条包含性别、UTR 阈值、人数上限，以及可选的线位白名单。 / 系统 SHALL 存储每个组别的胜负判定方式，区分「按胜场数」与「按加权分」两种。
- **Runtime**: `cd backend && uv run pytest tests/test_rules_model.py` → expected: 模型与 schema 归属测试全部通过
- **Code**:
  - 四张表（seasons / divisions / division_lines / division_eligibility_limits），不用 JSONB —— `cap IS NULL` 与线位白名单要能被 schema 表达和查询（design.md D1）
  - `buffer_per_line` 与 `buffer_total` 分两列存，不合并 —— 规则原文是两条独立约束
  - migration 首行 `set search_path to zijing_cup, public;`；`postgres` 角色默认 search_path 不含 `zijing_cup`，无限定 DDL 会静默落到 `public`（对方应用的 schema）
- **Threshold**: 80
