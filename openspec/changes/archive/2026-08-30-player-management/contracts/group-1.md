# Contract — Group 1: 数据模型与 migration

### Contract
- **Spec**:
  - 系统 SHALL 把队员存成跨赛季的实体，字段为姓、名、性别、当前单打 UTR 与其状态、当前
    双打 UTR 与其状态、UTR 档案链接。队员 MUST NOT 依赖队伍存在。
  - 当前 UTR 的状态取 `unrated` / `projected` / `rated`。这与参赛 UTR 的三档状态是两个
    互不相干的枚举，两者 MUST NOT 共用一张表，也 MUST NOT 互相推导。
  - 系统 SHALL 把参赛 UTR 存成 `(队员, 赛季)` 维度的记录，带状态（已认证/组委会审定/
    队长评定）、Appeal 标记、以及来源（`预填`/`组委会总表`/`admin裁决`）。Appeal MUST 是
    可叠加在任一状态上的独立标记，MUST NOT 做成第四种状态。
  - 成员关系带代表学校、是否外援、是否外卡；同一名队员 SHALL 能同时属于同一赛季的金组与
    银组两支队，MUST NOT 建成一对一。代表学校是自由文本，MUST NOT 关联学校表。
- **Runtime**: `cd backend && uv run pytest tests/test_players_model.py` → expected: 全部通过，含「(人,赛季) 唯一」「一人两组两条成员关系」「Appeal 与状态可共存」「当前 UTR 状态枚举里没有『队长评定』」四类断言
- **Code**:
  - 三张新表建在 `zijing_cup` schema，migration 以 `set search_path to zijing_cup, public;`
    开头（D1）。`roster_entries` 本次一行都不改——回滚成立的前提就是它没被动过。
  - 未裁决用一条记录带 `value` / `alt_value` / `is_unresolved` 表示，**不存成两行**：两行
    会让「(人,赛季) 唯一」失效，把冲突扩散给每一个读它的地方（D3）。
  - 全程 `Decimal`；UTR 是精确小数，float 只在边界上出错。
- **Threshold**: 80
