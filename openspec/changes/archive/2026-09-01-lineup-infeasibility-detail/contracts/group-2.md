### Contract
- **Spec**: 无解那条线，页面 SHALL 呈现后端给出的结构化原因（多因并存都呈现），取代光秃秃的「没有任何合法搭档」；后端给出归因时页面 SHALL 点名队员及去向。页面 MUST 说明去向是读取当前输入的结果，MUST NOT 呈现为「是这条锁定导致了无解」，也 MUST NOT 把资格/cap/差距呈现为用户造成。无解面板 SHALL 显式给自己底色，对比度 SHALL ≥ 4.5:1（computed style 实测），桌面与 <768 都读得清、不横向溢出。数值 SHALL 原样取自后端字符串，MUST NOT 拿显示值做比较。
- **Runtime**: `cd frontend && npm run test` → expected: NoSolution 新测试通过（含 token 断言、归因点名、资格不归因）、既有 LineupResults/LineupStates 测试无回归
- **Code**: D4 `lib/api.ts` 的 `LineupSearch` 加 `infeasibility?` 类型（reasons: {kind, message, attributed:{name,where}[]}[]）。`NoSolution` 有 `infeasibility` 则渲染原因列表 + 归因 chips，无则退回现有 placements 呈现；既有免责声明句保留。用**设计 token**（mock 的 hex 一一对应 `warning`/`warning-surface`/`warning-border`、中性 `muted`/`surface-muted`、排除 `danger`），不硬编码 hex。固定渲染顺序人手→cap→差距→资格。前端不做数值比较。
- **Threshold**: 70
