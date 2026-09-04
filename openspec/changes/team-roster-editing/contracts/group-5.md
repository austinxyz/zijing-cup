# Contract — Group 5

- **Spec**: 候选与已存阵容三行块里外援队员 SHALL 用可辨颜色/标记区分，不与 ♂/♀ 及估算标记混淆；桌面与 375 对比度 ≥4.5、不横向溢出；是否外援取自后端字段，前端只显示。
- **Runtime**: `cd frontend && npm run test` → expected: LineBlock 外援标记测试、候选/已存阵容传 borrowed、contrast 含外援 token 全通过；`npx tsc --noEmit` 干净
- **Code**: D5 `LineBlock` seat 加 `borrowed`，外援 seat 用新 token（`--color-borrowed-surface` 等，量 ≥4.5:1 进 globals.contrast.test.ts）；`CandidateCards`/`SavedLineups` seat 构造传后端 borrowed；`lib/api.ts` 候选/已存阵容 per-player 加 `is_borrowed_player`、`borrowed_over_limit` 收进 infeasibility literal union。
- **Threshold**: 70
