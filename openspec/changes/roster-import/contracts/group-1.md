# Contract — group 1: 球队与名单的数据模型与 migration

- **Spec**: 系统 SHALL 以 `(赛季, 组别)` 为维度存储球队与球员名单。一条名单记录是**该赛季该队的一行快照**，其唯一键为 `(赛季, 组别, 球队, 姓, 名)`。系统 MUST NOT 依据姓名把不同赛季或不同组别的记录自动归并为同一个人。 / 每条名单记录 SHALL 保存参赛 UTR、原始的 `DUTR Status` 文本、来源依据原文（总表的 `Notes` 列）与取样窗口的每日 UTR 值。来源依据 MUST 原样保留，MUST NOT 被规范化或丢弃。 / 名单记录 SHALL 可选携带 UTR profile ID。同一 profile ID 在同一赛季同一组别内 MUST 唯一；不同组别之间 MUST 允许重复。未关联 profile ID 的记录 MUST 不受影响。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_model.py` → expected: schema 归属、可空性与唯一约束测试全部通过
- **Code**:
  - 两张表 `teams` / `roster_entries`，**不建 `players` 表** —— 总表无 UTR profile ID，跨赛季同一性无法由数据证明，建实体会逼出基于姓名的自动归并（design.md D1）
  - 每日 UTR 值用 `numeric[]` 而非单独的表：整体读写、从不单查某一天（D2）
  - `rating_class` 可空；`utr_profile_id` 部分唯一索引 `where not null`，作用域是组别而非全局（规则允许一人同时参加金银两组）
  - `is_borrowed_player` 用**可空**布尔而非 `not null default false`：未标注与「确认不是外援」是两回事，把前者呈现为后者会让下游算出未经检验的结论（design.md D1b）
  - migration 首行 `set search_path to zijing_cup, public;`，否则 DDL 以 `postgres` 角色落进 `public`（对方应用的 schema）
- **Threshold**: 80
