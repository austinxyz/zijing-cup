### Contract
- **Spec**: 无解那条线，系统 SHALL 一并给出**为什么这条线的候选池为空**的结构化诊断，覆盖客观原因（性别组合人手不足 / 都超 cap / 都超搭档差距 / 资格线限制），可并存全部据实列出，MUST NOT 只挑一个猜「主因」。诊断 SHALL 是**只读**的候选池分析，MUST NOT 触发第二次整解搜索，MUST NOT 声称是哪一条锁定导致了无解。诊断 SHALL 在可直接读出时归因到用户动作（排除、锁进别线），点名队员及去向；归因 MUST 仅针对排除与锁进别线，资格/cap/搭档差距 MUST NOT 归因成用户造成。数值 SHALL 以字符串形式给出。
- **Runtime**: `cd backend && uv run pytest tests/lineups/` → expected: 每类原因的最小无解场景测试通过、既有 lineups 测试无回归、无 import 错误
- **Code**: D1 独立 `Infeasibility`/`InfeasibilityReason`/`PlacedPlayer` 结构，不复用 `Violation`；`infeasible_line` 保留、`infeasibility.line` 同值。D2 新 `diagnose_line(rules, rule, available, placements)` 用与 `legal_pairs` 相同的 `available` 池与四关判定，一趟 `combinations`、无第二次搜索。D3 归因只挂 `gender_shortage`、只读 `placements` 里 `where != 本线` 的同性别队员；`over_cap`/`over_gap`/`eligibility` 的 `attributed` 恒空、中性措辞。资格判定只报可局部判定的 `restricted_to_lines` 事实。
- **Threshold**: 80
