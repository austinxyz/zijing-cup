---
Date: 2026-09-04
Change: team-roster-editing
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# team-roster-editing — 队伍页就地编辑 + 外援上场限制

队长目前只能读队伍页；改队员 UTR、标外援、填学校都得等组委会新总表，或走没有的后台。
同时「每场外援上限」这条真实赛制规则系统从没校验过（`borrowed_players_checked` 恒
false）。这个 change 给队伍页加就地编辑（复用阵容页的口令解锁），批量改双打 UTR，编辑
外援/外卡/代表学校与队伍的学校数，并让外援上场限制**真正进引擎**、在候选/已存阵容里用
颜色标出外援。

## Goals

1. **就地编辑模式（复用阵容页那套）。** 队伍页 `teams/[code]` 顶部加「编辑模式」开关：
   就地输 admin 口令解锁编辑（复用 `unlockAdmin` / 登录 action，不跳 `/login`），密码错/
   限速同款反馈；写操作仍由后端方法判权中间件保护。
2. **批量改双打 UTR，一次 Save。** 编辑态下队员列表可就地改每人的**双打 UTR**，改多人后
   一个「保存」提交。沿用既有「未锁季时写双打 UTR 顺带覆盖该赛季参赛 UTR」的语义与**赛季锁
   护栏**（已锁季则拒绝覆盖参赛值，界面说明）。
3. **编辑外援 / 外卡 / 代表学校 / 学校数。** 编辑态下可改每名队员的 `is_borrowed_player`、
   `is_wildcard`、`representing_school`（成员级，`PlayerTeamMembership` 已有这三列），以及
   **队伍的学校数**（新 `teams.school_count`）。代表学校**按条件**：勾了外援**或**外卡的队员
   不选学校（外部球员，无本校可代表——该行学校控件禁用/清空）；其余（本校）队员**要**选学校。
   外卡只影响显示、不影响资格。外援上限只看队伍学校数与外援勾选。
4. **外援上场限制进引擎（数据化、按 division 存）。** 规则**与赛事绑定**（2026 金/银是当前
   这套，明年可能变），不硬编码：按 division 存进规则表、随 seed 灌。当前规则：
   - 1 校联队：名单 ≤3 外援、每场上场 ≤2；
   - 2 校：名单 ≤2、每场 ≤1；
   - 3 或 4 校：不得有外援（0 / 0）。
   阵容搜索校验**上场十人**里的外援数 ≤ 该队 `on_court_cap(school_count)`；名单总外援数 ≤
   `roster_cap(school_count)` 作为编辑时的校验。`school_count` 未填时**不校验**（未知不等于 0）。
5. **候选/已存阵容标出外援。** 候选阵容与已存阵容的三行块里，外援队员用与普通队员**不同的
   颜色/标记**区分（对比度达标）。

## Non-Goals

- 不做实时 UTR 同步（参赛 UTR 仍是赛前冻结值）。
- 外卡不进搜索约束（模型注释明确：不影响资格）。
- 不改高 UTR 上限（`division_eligibility_limits`）与现有合法性引擎的其它四关。
- 不做多用户分级权限（沿用共享密钥 + 就地解锁的单管理员模型）。
- 代表学校仅本校队员填；外援/外卡不填（无本校可代表）。学校数是人工填的队伍属性
  （`teams.school_count`），外援上限只用它，不从 `representing_school` 自动推导。

## Constraints

- 架构不变：浏览器→Next→FastAPI（`lib/api.ts` 单一出口）→DB；只有 FastAPI 访问库。
- 写鉴权按 HTTP 方法判（中间件），新写路由不声明也受保护；就地解锁只是入口，不新开信任面。
- `zijing_cup` schema；migration 是 schema 变更唯一来源；**禁止对远程跑 `db push`/`repair`**，
  远程改动去 Dashboard SQL 手工执行，本地直接打到 127.0.0.1 本地栈。
- 数值全程 `Decimal`、前端只显示后端字符串、不做数值比较；参赛 UTR 覆盖只在未锁季发生。
- 外援上限规则数据化：像 `division_eligibility_limits` 一样按 division 存、seed 灌，可逐年改。
- 冷启动免费实例：新增校验不得显著拖慢搜索；无解归因文字沿用既有 `NoSolution` 结构。

## Success Criteria

1. 未登录在队伍页开「编辑模式」→ 就地输正确口令 → 解锁编辑控件；口令错走登录同款反馈；
   解锁后写生效。
2. 编辑态批量改若干人双打 UTR → 一个 Save 提交 → 全部写入；未锁季顺带覆盖参赛值、已锁季
   拒绝并说明；只读用户看不到编辑控件。
3. 能改并保存 `is_borrowed_player`/`is_wildcard`/`representing_school`（外援/外卡行学校禁用）
   与 `teams.school_count`。
4. 搜索：上场十人外援数超过 `on_court_cap(school_count)` 的阵容不作为合法候选；因外援超限
   导致无解时 `NoSolution` 以**新原因类型 `borrowed_over_limit`** 呈现，点名是哪几名外援、
   超了多少（沿用既有原因/归因结构）。`school_count` 未填时搜索不因外援拦。
5. 名单总外援数超过 `roster_cap(school_count)` 时，保存**警告放行**（允许存、醒目提示
   「超名单外援上限」，不硬拦——编辑中间态常暂时超限，硬拦会卡死流程）。
6. 候选与已存阵容里外援队员有可辨的颜色/标记，桌面与 375 均对比度 ≥4.5、不横向溢出。
7. 外援上限规则由 seed 按 division 灌入（2026 金+银），换 division/赛季可改数据而不改代码。
8. 客户端 bundle 不含 `BACKEND_SECRET`；`npx tsc --noEmit` 干净。

## User Stories

- 作为队长，我在自己队伍页开编辑模式、把几个人的双打 UTR 一次改好保存，不必等新总表。
- 作为队长，我标出队里的外援、填上代表学校与本队由几所学校组成，系统据此在排阵时挡掉
  上场外援超限的阵容，并在候选里让我一眼看出谁是外援。
- 作为只读访客，我照常看队伍与阵容，看不到也不受编辑控件影响。

## Open Questions

1. **外援配色 token**（留 Phase 4 视觉定）：用什么表示外援（角标 / 名字色 / 底色），需与
   现有 ♂/♀、估算标记不撞、对比度达标。

### 已定（评审拍板）

- **名单总外援超限 → 警告放行**（不硬拦；编辑中间态常暂时超限）。
- **上场超限 → 新原因类型 `borrowed_over_limit`**，`NoSolution` 点名外援 + 超出量。
- **外援上限规则形态 → 逐行表** `division_borrowed_limits(division_id, school_count,
   roster_cap, on_court_cap)`，与 `division_eligibility_limits` 一致，按 division seed 灌。
- **代表学校按条件编辑**：外援/外卡不填、其余本校队员填；`teams.school_count` 人工填，是外援
   上限唯一需要的学校信息（不从 representing_school 推导）。

## Referenced Capabilities

- `team-roster-ui`（修改）：队伍页编辑模式、批量双打 UTR、外援/外卡勾选、代表学校（条件）、
  学校数编辑。
- `player-admin`（修改/复用）：`update_player` + membership 写入（`is_borrowed_player`/
  `is_wildcard`/`representing_school`）、批量双打 UTR 写入与参赛值覆盖（赛季锁护栏）。
- `lineup-search`（修改）：上场外援数 ≤ on_court_cap 校验、无解归因、`borrowed_players_checked`
  真正落地；新外援上限规则表 + seed。
- `lineup-ui`（修改）：候选/已存阵容三行块外援配色。
- `admin-access`（复用）：`unlockAdmin` 就地解锁、方法判权中间件。
- 新 schema：`teams.school_count`、`division_borrowed_limits`（或等价）。

## Design System

沿用项目既定风格 `linear`（与阵容页/名单页一致，见既有 mocks 与 `frontend/app/globals.css` 的 token）。本 change 不新引入设计系统，只新增「外援」配色 token。
