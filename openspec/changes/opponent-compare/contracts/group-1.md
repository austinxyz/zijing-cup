### Contract
- **Spec**: opponent-compare —— 「对比 SHALL 按规则线序逐线并排：每线显示我方两人（姓名+性别+该线当前 UTR 和）、对手两人、以及差距 = 我方线和 − 对手线和；底部两队总 UTR 和与其差」；「姓名与性别 SHALL 由各队 roster 按球员 key 解析」；「对比用当前值；某侧 status utr_moved/illegal/player_gone 标注；player_gone 不显示假总和」；「MUST NOT 判胜负/预测比分」。
- **Runtime**: `cd frontend && npm run test -- compare` → expected: 组装纯函数单测过（逐线配对、差、总和、status、缺线/缺人边界）；`npx tsc --noEmit` 干净。
- **Code**: 纯函数 `buildComparison(lineOrder, sideA, sideB)`（side = {savedLineup, byKey:Map<key,RosterPlayer>}）→ 逐线 rows + totals；UTR 差用 `Number(值字符串)` 相减**仅供显示**（两位小数、不回写、不判定），两侧该线都有 `line_totals[line].value` 才算差否则「—」；总和差同理（两侧 total 非 null）；`player_gone`→total null 不硬凑；姓名经 byKey 解析，缺 key→占位。
- **Threshold**: 80

