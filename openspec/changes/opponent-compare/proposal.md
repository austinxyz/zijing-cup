---
Date: 2026-09-06
Change: opponent-compare
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-06-opponent-compare-requirements.md
---

## Why

侧栏有个 disabled 的「对手对比」占位。排阵前想把自己准备的一套阵容和预判对手会上的一套逐线摆一起，
看每条线领先/落后多少。你不知道对手当场会上什么，所以对手那套也是**提前给对手队存好的**某套已存阵容。
已存阵容、roster、规则线序都已就绪，只差一个把两侧并排的只读页面。

## What Changes

- **新页 `/[season]/[division]/compare`**：两个「队 + 已存阵容」选择器（我方 / 对手，同赛季/组别），
  逐线并排两套阵容。
- **逐线只摆事实**：按规则线序（D1/D2/D3/MD/WD）每行 —— 我方两人（姓名 + 性别 + 该线 UTR 和）｜
  差距（我方线和 − 对手线和）｜ 对手两人；底部一行两队总 UTR 和 + 差。**不判胜负、不预测比分。**
- **姓名经 roster 解析**：已存阵容只存 `assignment`（线→球员 key）+ `line_totals` + `total`，逐队取
  `getTeamRoster` 建 `key→RosterPlayer` 解析姓名/性别（与已存阵容页同法）。
- **陈旧/非法标注**：用当前 `line_totals`/`total`；某侧 `status` 为 `utr_moved`/`illegal`/`player_gone`
  时明确标出，`player_gone` 不硬凑总和。
- **点亮侧栏**：`nav.ts` 的「对手对比」从 `pending:true` 改为可点、指向 `/compare`。
- **权限**：`/compare` 按 `canEdit(season, division)` gate（已存阵容是管理员机密），未解锁进不去、
  无游客视图。选择器状态进 URL 可分享。

## Capabilities

### New Capabilities

- **opponent-compare** —— `/compare` 页：两侧「队+已存阵容」选择、逐线并排（事实性 UTR 对比）、
  陈旧/非法标注、canEdit gate。

### Modified Capabilities

- **app-shell** —— 侧栏「对手对比」导航项从 pending 占位改为指向 `/compare` 的可用链接。

## Impact

- 前端：新 `app/[season]/[division]/compare/`（`page.tsx` server component 读 searchParams、取两侧
  saved lineups + roster、组装逐线；client 选择器组件；`error.tsx`）。`nav.ts` 改「对手对比」项。
  复用 `lib/api.ts` 的 `getDivisionTeams`/`getSavedLineups`/`getTeamRoster`/`getDivisionRules`。
- 后端：**无改动**（全部只读复用现有端点）。无新表、无 migration。

## Out of Scope

- **名单实力对比**（两队按 UTR 深度并排）—— 后续 change。
- 胜负预测 / 总比分预测；引擎实时解对手最优阵容。
- 不改已存阵容/roster 数据模型、不做实时 UTR 同步。
