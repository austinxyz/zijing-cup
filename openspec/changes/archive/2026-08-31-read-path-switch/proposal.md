---
Date: 2026-08-30
Change: read-path-switch
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-30-read-path-switch-requirements.md
---

## Why

上一个 change 建好了队员注册表并把线上两季迁了进去，但读取仍走旧的名单快照。后果写在
它自己的 Non-Goals 第一条：**管理员在管理界面里做的任何修改，在球队名单页与排阵页上都
看不见**。本 change 关掉这个窗口。

拖着不做还有第二个代价：名单 CSV 导入器现在写旧表，「窗口期暂停导入」是靠人记得的约定。
切换之后，那条约定要变成机器执行的规则——否则一次导入会输出「+30 行」而网站毫无变化。

## What Changes

- 三处读取从 `roster_entries` 换成新表：球队列（人数与男/女/未知三档）、球队名单页、
  排阵引擎的名单读取。
- 新增**参赛 UTR 推导链**。新模型允许「在队但该赛季没有参赛 UTR」，旧表不允许
  （`match_utr` 是 NOT NULL）。按组委会自己的规则逐级回退：本赛季冻结值 → 当前 rated
  双打值 → 最近一个有值赛季的 match UTR（不限一年）→ admin 手输。四步都取不到的队员
  不参与排阵，且结果里报出人数。名单页与排阵引擎**共用**这条链。
- **BREAKING**：阵容锁定的 key 从 `roster_entries.id` 变成带前缀的形式。旧的分享链接
  会失效——这是有意的：两套 id 都是整数且互不相干，不换格式的话旧链接会静默锁到别人。
- 估算值在三处标记：队员的数字旁、整套候选上、可达上限旁。
- 排阵页兑现上一个 change 推过来的那句：「含 N 名参赛 UTR 未裁决的队员」。
- 名单导入器在切换后拒绝运行并说明原因。

## Capabilities

### New Capabilities

无。本 change 不引入新能力，只把已有能力的数据来源换掉，并把新来源带来的新状态
（缺值、估算、未裁决）表达出来。

### Modified Capabilities

- `team-roster` —— 数据来源从名单快照换成队员注册表；响应字段集合不变
  （`dutr_status` / `source_note` / `daily_utrs` 保留但恒为 null）。
- `lineup-search` —— 名单读取换源；新增推导链、估算标记、未裁决计数、缺值人数；
  key 格式变更。
- `lineup-ui` —— 估算与未裁决的呈现，缺值人数的呈现，旧链接失效的提示。
- `team-roster-ui` —— 「UTR 来源」列不再显示总表原文；缺值队员显示推导值与估算标记；
  当前 UTR 列标明人工维护。

## Impact

- `backend/app/rosters/query.py` —— 两个读取函数换源。
- `backend/app/lineups/query.py` —— `load_roster` 换源 + 推导链 + key 格式。
- `backend/app/players/` —— 推导链的纯函数实现（取值规则是规则，不是查询细节）。
- `backend/app/rosters/load.py` —— 导入器加自锁。
- `backend/tests/` —— 三处读取的既有测试要改成对新表建 fixture；`test_lineup_api.py`
  的 key 断言要跟着变。
- `frontend/lib/api.ts` —— 响应类型新增估算/未裁决/缺值字段。
- `frontend/app/[season]/[division]/lineup/` —— 三处标记与两句顶部提示、旧链接提示。
- `frontend/app/[season]/[division]/teams/` —— 「UTR 来源」列与当前 UTR 列的说明。
- 无 migration：新表已就位，本次不改 schema。

## Out of Scope

- **当前 UTR 的来源**（同步或批量导入）。由项目负责人自行导入或在管理界面编辑。
- **名单 CSV 导入器改写目标表** —— 下一个 change。本次只让它挡住自己。
- **删除 `roster_entries`** —— 保留只读，作为回滚依据与迁移命令的输入。
- **移动端版式。**
