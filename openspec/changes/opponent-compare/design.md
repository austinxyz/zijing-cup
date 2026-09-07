## Context

已存阵容（lineup-saved-lineups）存 `assignment`（线→球员 key 对）、`line_totals`（线→当前重算 UTR
和/cap/over）、`total`、`status`（valid/utr_moved/illegal/player_gone），**不带姓名**——已存阵容页用
`byKey = Map(roster.map(p => [p.key, p]))` 从 roster 解析姓名/性别。规则线序来自 `getDivisionRules`
的 `lines`。已存阵容是管理员机密，只对 `canEdit` 显示。`nav.ts` 的「对手对比」现为 `pending:true`。

## Goals / Non-Goals

**Goals:** 分区级 `/compare` 只读页——两侧「队+已存阵容」逐线并排（事实性 UTR 对比）+ 点亮侧栏。

**Non-Goals:** 不改后端（全只读复用）、无 migration；不做名单实力对比 / 胜负预测 / 引擎解对手最优。

## Decisions

### D1 — 纯前端组装，无后端端点
`/compare/page.tsx`（server component）读 `searchParams`（`a`/`al` 我方队+阵容 id，`b`/`bl` 对手），
并发取：`getDivisionTeams(season,division)`（选择器列队）、`getDivisionRules`（线序），以及**每个已选
队**的 `getSavedLineups(team)` + `getTeamRoster(team)`。逐线组装：对每条规则线，从两侧 saved lineup 的
`assignment[line]` 取 key 对 → 各自 `byKey` 解析姓名/性别，UTR 和取该侧 `line_totals[line].value`。
后端零改动。

### D2 — 选择器是 client + 软导航改 URL
`CompareControls`（client）：两个队 `<select>` + 两个阵容 `<select>`。改动 → `router.push` 改 URL
参数（改队则清掉该侧的阵容 id）。阵容下拉的选项来自该侧已选队的 saved lineups（server 已按 URL 取好、
作为 props 传入）。状态全在 URL，不留本地 state（与全站一致）。非受控 select + 软导航回填的坑：按
URL 值给 `<select>` 的 `value`（受控）或给控件 `key`（含当前四个参数）在参数变化时 remount，避免回填
陈旧。

### D3 — canEdit gate（机密）
`page.tsx` 起手 `if (!(await canEdit(season, division))) redirect(...)`（带到队伍页/解锁入口），与
players 写页、saved-lineups 机密一致。无游客视图。配 `compare/error.tsx`（取数失败就地降级，不塌侧栏）。

### D4 — 线序与对齐
线序用 `getDivisionRules(...).lines` 的顺序迭代，不写死 D1/D2/D3/MD/WD。两侧按同一线序对齐；某侧该线
缺失（assignment 无此线）→ 显示占位而非崩。

### D5 — 陈旧/非法与差距
每侧展示其 `status`；`utr_moved`/`illegal` 用当前 `line_totals` 照常呈现但标状态；`player_gone` 标状态
且不显示总和（`total` 为 null）。逐线差 = 我方 `line_totals[line].value` − 对手同线值（Decimal 字符串
→ 数值相减用于显示，展示保留两位；两侧该线都有值才算差，否则显示「—」）。底部总和差同理（两侧 total
都非 null 才算）。

### D6 — 点亮侧栏
`nav.ts` 的 `opponents` 项：`pending:false`、`href: ${base}/compare`（SWAP_ICON 已在用）。app-shell 的
「未实现项禁用」规则不变，只是此项转为已实现链接。

## Risks / Trade-offs

- [UTR 差用字符串相减出错] → 两侧值是 Decimal 字符串，`Number()` 后相减仅用于**显示**（保留两位），
  不回写、不参与判定；两侧都有值才算差。
- [软导航回填陈旧 select] → 受控 select 按 URL 值，或按四参数 `key` remount（既有 pitfall）。
- [某队无已存阵容 / 某线缺失 / player_gone] → 各自空态/占位/状态标注，不崩不硬凑。
- [已存阵容机密泄露] → page 起手 canEdit 重定向 + 无游客视图，和 saved-lineups 一致；`/compare` 自带
  error.tsx，取数失败就地降级。
- [对比页取数较重（两队 saved+roster + teams + rules）] → 用 `Promise.all` 并发；只在两侧都选定时才取
  两队的 saved+roster，未选侧不取。

## Migration Plan

无 migration、无后端改动。纯前端新页 + 一处 nav 改。Vercel 部署即可；回滚 = revert。

## Open Questions

（explore 已定；apply 仅需确认 `RosterPlayer.key` 与 saved `assignment` 的 key 同源——已存阵容页
`byKey` 已证实同源，非阻塞。）
