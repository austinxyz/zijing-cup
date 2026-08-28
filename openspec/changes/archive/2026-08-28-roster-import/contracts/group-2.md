# Contract — group 2: CSV 解析与评级类别判定

- **Spec**: 系统 SHALL 依据 `DUTR Status` 判定规则评级类别：`Rated` 为第 1 类已认证，`Projected` 为第 2 类委员会审定。`Unrated` 的类别取决于该队员是否有 USTA 比赛历史，该信息不在总表中，因此 MUST 留空待人工判定。系统 MUST NOT 为 `Unrated` 猜测一个类别。 / 导入 MUST 识别并跳过总表中的非名单行，MUST NOT 将其建为球队，且被跳过的行 MUST 出现在对账报告中。
- **Runtime**: `cd backend && uv run pytest tests/test_roster_parse.py` → expected: 三种状态判定、Appeal 后缀、伪队名跳过、不可解析行的测试全部通过
- **Code**:
  - `Unrated` 一律留 NULL。不要用 `Notes` 自动推断类别——该映射未经组委会确认，而 `self_rated` 直接决定「上场 ≤2 名且不得互相搭档」这条硬约束，猜错会放出非法阵容且被「已自动判定」的外观掩盖（design.md D3）
  - `/ Appeal` 后缀不参与判定，但 `dutr_status` 保留完整原文
  - 列名按位置与前缀匹配，不硬编码完整列名——取样窗口日期逐年变（2025 是 09/22，2026 是 09/21）；无法识别的列进报告而非静默丢弃（D6 风险项）
  - 解析阶段纯函数：输入 CSV 文本，输出记录与报告，不碰数据库
- **Threshold**: 80
