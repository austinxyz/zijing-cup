### Contract
- **Spec**:
  - 系统 SHALL 把一套阵容的合法性判定为下列约束的合取，缺一不可：逐线 cap 加每线
    buffer；各线超出量之**和**不超过**全队** buffer 额度；搭档差距；三条男双线的
    参赛 UTR 之和非递增（相等不算违规）；高 UTR 的人数与线位；十人互不重复。
    系统 MUST NOT 逐线独立判定 buffer。cap、buffer 额度、差距上限与高 UTR 阈值
    MUST 全部来自 `competition-rules` 的数据，MUST NOT 写成代码常量。
  - 开放线 MUST NOT 参与 cap 校验，也 MUST NOT 消耗全队 buffer 预算；表达为「无上限」，
    MUST NOT 用一个很大的数字代替。
  - 高 UTR 限制 SHALL 同时校验人数上限与允许的线位。女队员打男队员位置时 SHALL 按
    男队员的限制判定。
  - 校验不合法阵容时，每一条违规都 SHALL 指明线位与差额。
- **Runtime**: `cd backend && uv run pytest tests/test_lineup_rules.py` → expected: 全部通过，含「逐线都在容差内但合计超预算」「男双相等不算违规」「开放线不占 buffer」「高 UTR 线位越界」四类边界
- **Code**:
  - 纯函数：输入是已读出的名单记录与规则值，不碰数据库。约束逻辑要能用虚构数据
    密集测试。
  - **全程 Decimal**。10.25 与 10.2 对 cap 是不同答案；任何一处退化成 float 都会在
    边界上给出错误判定且难以发现。必须有「恰好等于 cap」与「恰好等于 buffer 额度」
    的用例。
  - `restricted_to_lines` 可空：「不限线位」与「限定某几条线」两条路径都要走通。
- **Threshold**: 80
