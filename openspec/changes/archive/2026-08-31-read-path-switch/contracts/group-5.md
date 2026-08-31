### Contract
- **Spec**: 当参赛 UTR 不是该赛季的冻结值而是按推导链取得的，该行 SHALL 在参赛 UTR 旁标注估算，逐字为 `估算 · <年份> 参赛值` 或 `估算 · 当前已认证值`，用 warning 档。MUST NOT 只写「估算」而不写年份。判定类别有三档：已认证 / 委员会审定 / 队长评定；为空时 MUST 呈现为「待定」。Appeal SHALL 以 `<类别> · Appeal` 呈现。页面 MUST NOT 再渲染总表原文。名单页 SHALL 逐字呈现 `当前 UTR 由人工维护，未与 UTR 官网同步`，用中性档。
- **Runtime**: `cd frontend && npm run test -- roster` → expected: 全部通过；token 断言经 `wrapper.classes()` 命中 warning 档
- **Code**:
  - D2：中文文案在前端拼，后端只给 `origin` / `origin_year`。
  - 色档沿用既有三档，不新增 token：估算用 `--color-warning-*`，说明用中性 `--color-border` / `--color-surface-muted`。danger 本次不用。
  - `frontend/lib/api.ts` 是唯一出口，新增字段的类型改在那里；改完记得跑 `npx tsc --noEmit`（vitest 只转译不校验类型）。
- **Threshold**: 70
