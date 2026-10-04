---
Date: 2026-10-03
Change: match-results-tracking
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-10-03-match-results-tracking-requirements.md
---

## Why

团体赛打完的对局现在没地方记——谁对谁、用了哪套阵容、每线输赢，赛后全靠记忆。录下来后，排阵时
能查「我方对这支队以前怎么排的、哪条线赢过」，把历史战果变成下次排阵的情报。

## What Changes

- 新增**比赛记录** capability：管理员录入一场已打完的比赛（日期必填、对手队同组、轮次可选自由文本、
  我方逐线上场球员、对手逐线上场球员、每线 win/loss + 可选备注）。
- 我方阵容存为比赛自己的**快照** `{line: [player keys]}`（不是外键引用某套已存阵容），录入时可
  「复制自某套已存阵容」预填再改；存一个**可空** `source_lineup_id` 仅作溯源。
- 对手逐线上场球员引用对手队当季名单 player；对不上的留空（不塞哨兵）。
- 整场胜负由逐线结果按该 division `scoring_mode` **自动计算**（银 `match_count` 数赢线、金 `points`
  加权），只读、从不手填。
- **对手对比页**（`/compare`）加「历史对局」区：选中对手队后列出我方对该队打过的场次（日期/阵容/
  逐线结果/整场）。没打过则空、不报错。
- **比赛历史列表页**：列该组所有录过的比赛，可按队筛，点进看逐线详情；侧栏加入口。
- 全部按 `canEdit(season, division)` 门——免密队员录入入口不出现、历史页不可达、对手对比看不到历史区。

## Capabilities

### New Capabilities

- `match-results` —— 比赛记录表 + CRUD 端点 + 整场按 scoring_mode 自动算分 + 历史列表读 +
  比赛历史页/录入表单 + 侧栏入口。

### Modified Capabilities

- `opponent-compare` —— 对手对比页加「历史对局」区（选中对手后显示我方对该队的历史战果）。

## Impact

- **后端**：新表 `zijing_cup.match_records`（+ 逐线结果结构，design 定 JSONB vs 子表）；migration
  `supabase/migrations/`（远程走 Dashboard 手工执行，no-CLI-push）；`app/matches/`（计算整场胜负、
  CRUD）；`app/routers/matches.py`（受 `WRITE_METHODS` 中间件自动保护的写 + canEdit 读）；复用
  `players`/`roster`/`rules`（线序、scoring_mode）、`saved_lineups`（预填来源）。
- **前端**：`lib/api.ts` 加 `getMatchRecords`/相关读（缺表降级为空）；`lib/admin.ts` 经 `adminWrite`
  写；新路由 `app/[season]/[division]/matches/`（录入表单 + 历史列表 + 逐线详情，自带 `error.tsx`）；
  `compare/page.tsx` + 组件加「历史对局」区；`Sidebar`/`nav` 加入口。
- **依赖**：无新第三方依赖。

## Out of Scope

- 球员赢率聚合（「某人上 D1 赢率」）—— 延后到未来 change（`match-results-player-stats` 之类）。
- 比分结构化（6-3/7-5）—— 细节塞逐线备注自由文本。
- 向免密队员公开比赛结果（不走 lineup-publish 公开开关）—— 以后要再加。
- 回喂排阵引擎（据历史自动改候选/推荐）—— 只做人读参考。
- 从外部（赛事官网/表格）自动抓比赛结果 —— 纯手工录入。
