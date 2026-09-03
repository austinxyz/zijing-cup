---
Date: 2026-09-02
Change: lineup-single-pin
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-09-02-lineup-single-pin-requirements.md
---

## Why

排阵现在只能**锁整对**（一条线两个座位都填）。队长常想「把某人钉在某条线、搭档交给引擎」，
但每条线只填一个人会被**无声丢弃**，引擎忽略意图、给出没照钉法的阵容——读起来像「算不出
合适阵容」。真实报告：2026 银组 ZJU-USC 每线指定一人，系统给不出。本次补上单座位 **pin**。

## What Changes

- **单座位 pin**：一条线只填一个座位 = 把那人钉在该线，引擎在满足全部规则（cap、全队 buffer、
  搭档差距、男双不倒挂、高 UTR 人数/线位、性别组合）下选搭档、排满其余，目标仍是上场十人
  参赛 UTR 之和最大。
- **半填即 pin，不再无声丢弃**：填一个=pin；两个=硬锁整对（**BREAKING**：半填线以前被忽略，
  现在变成一个约束）；都不填=交给引擎。pin/硬锁/排除可混用。
- **诊断懂 pin**：被钉的线配不出合法搭档而无解时，点名被钉者+线，复用四类原因（人手/超cap/
  超差距/资格）但**限定在「含被钉者的对」**里算。
- **冲突输入明确拒绝**：同一人钉两条线、pin 与排除同指一人、一条线两座位同一人 → 4xx。
- 前端把「已钉一人·搭档交给引擎」显式呈现，与硬锁、空线区分。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `lineup-search` —— 引擎接受 pin（`options[L]` 限含被钉者的合法对、pin 从其它线池剔除）、
  pin 感知的 `diagnose_line`、端点 pin 参数与冲突校验。
- `lineup-ui` —— 半填=pin 的呈现与标识、pin 造成无解的面板。

## Impact

- 后端：`backend/app/lineups/search.py`（`search_lineups` 收 pins、`options` 构造、
  `diagnose_line` 加 pin 参数）、`backend/app/routers/lineups.py`（`pin=LINE:key` query 参数 +
  冲突校验）、`backend/app/lineups/query.py`（透传）；`backend/tests/` pin 单/多线、无解诊断、
  冲突拒绝、女将钉男双。
- 前端：`frontend/lib/api.ts`（`LineupConstraints` 加 pins + query 编码）、
  `frontend/app/[season]/[division]/lineup/[code]/`（`constraintsFromQuery` 半填=pin、控件三态
  标识、pin 无解面板）+ 测试。
- 无新表、无 migration。`npx tsc --noEmit` 单列。

## Out of Scope

- 不改硬锁整对行为；不做「钉在任意线、引擎选哪条线」（pin 绑具体线）；不改目标函数/规则本身/
  候选呈现；不做保存 pin 组合（pin 编码进 query 后自然可被 lineup-saved-filters 的 preset 存，
  但本次不动 preset 代码）；不做 per-user/存储/迁移。
