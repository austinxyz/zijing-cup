## Context

引擎 `search_lineups`（[search.py:462](backend/app/lineups/search.py)）用分支限界：`options[code]`
是每条线的候选对，递归每条线选一个、用 used 集防重用人。锁定线 `options[code]=[那一对]`，两名
被锁的人从 `available` 剔除（[search.py:496-497](backend/app/lineups/search.py)）。前端
`constraintsFromQuery` 只在两个座位都填时才当锁定，半填丢弃。`diagnose_line`（A change）在一条
线的候选池上按四类原因分类，但不知道 pin。`search_team_lineups`（query.py:424）把 key 解析成
`Candidate` 并对未知/自搭档 key 抛 `UnknownReference`（422）。路由 `_parse_locks` 解析
`lock=LINE:a,b`。

## Goals / Non-Goals

**Goals:** 单座位 pin（引擎配搭档）、半填=pin 不再无声丢弃、pin 感知诊断、冲突输入拒绝、
前端三态可辨。

**Non-Goals:** 不改硬锁；不做跨线自动分配；不改目标函数/规则/候选呈现；不动 preset 代码；
无 per-user/存储/迁移。

## Decisions

### D1 — 编码：独立 `pin=LINE:key`，不重载 `lock=`

后端新增可重复 query 参数 `pin=LINE:key`（一条线一个），与整对 `lock=LINE:keyA,keyB` 并列。
不让 `lock=LINE:key`（单 key）兼表 pin —— `_parse_locks` 现在对「不是正好两个 key」直接判
malformed，重载它会把「打错的锁」和「有意的 pin」混为一谈。前端 `constraintsFromQuery`：一条
线**恰好一个**座位填了 → pin；两个都填 → lock；两个填同一人 → 视为非法（既不发 lock 也不发
pin，前端提示或后端 422）。前端把 pin 编码成 `pin=` 参数（`lib/api.ts` 的 query 构造 +
`LineupConstraints` 加 `pins: Record<line,key>`）。

### D2 — 引擎：`options[L]` 过滤到含 pin 的对，pin 从其它线池剔除

`search_lineups` 新增 `pins: Optional[dict[str, Candidate]] = None`（line→被钉者）。

- `committed`（从 `available` 剔除）= 硬锁两人 ∪ **pin 的被钉者**。搭档不预先剔除——它从
  `available` 里现选。
- 对被钉线 L：`options[L] = [pair for pair in legal_pairs(rules, ruleL, available + [pin_L]) if pin_L in pair]`。
  即把被钉者临时并回池子跑 `legal_pairs`（性别/差距/cap/资格四关照常），再筛出含被钉者的对，
  strongest-first 排序不变。因为被钉者已从 `available` 剔除，其它线的 `options` 天然不含他；
  递归 used 集保证被钉者与所选搭档不被别处重用。scarcest-first 排序用 `len(options)`，pin 线
  通常候选很少 → 自然靠前，剪枝更早。
- 硬锁线、自由线逻辑不变。

### D3 — 诊断：`diagnose_line` 加 `pinned: Optional[str]`

签名加 `pinned`（被钉者 key，或 None）。为 None 时行为与今天完全一致；不为 None 时，四关
分类的 `combinations` **只遍历含被钉者的对**（`(pin_player, other) for other in available`），
其余判定（性别人手、cap、差距、资格）照旧但基数是「含 pin 的对」。message 前缀点名被钉者与
线（「你把 X 钉在 L，但…」）。`search_lineups` 在被钉线 `options[L]` 为空时以 `pinned=pin_L`
调它。非 pin 线仍 `pinned=None`。诊断仍只读、不第二次搜索。

### D4 — 冲突校验放 `search_team_lineups`（与既有 key 解析同处）

pin 的解析与校验放在 query.py（已经在解析 lock/exclude key、抛 422 的地方）：
- pin 的 line 未知 / key 未知 → 422（复用 `UnknownReference`）。
- 同一 key 出现在**多条** pin → 422。
- pin 的 key ∈ 排除名单 → 422。
- pin 的 key ∈ 任一硬锁线成员 → 422。
- 路由层 `_reject_old_keys` 也扫 pin 的 key（旧格式 → stale-link）。

解析出 `pins: dict[str, Candidate]` 传给 `search_lineups`。响应模型不变（pin 造成的无解走既有
`infeasibility`，只是 message 带 pin 点名）。

### D5 — 前端呈现与「pin 的代价」

`constraintsFromQuery` 分出 `{locks, pins, excluded}`。控件按每线已填座位数渲染三态（mock：
pin 态 warning 描边 + 「已钉」角标 + 「搭档交给引擎」小字；硬锁 primary 描边 + 「锁整对」）。
pin 与锁定/排除任一非空即「有约束」→ 页面既有的第二次无约束 baseline 搜索照跑（`Promise.all`
并发，不新增顺序等待），「pin 的代价」自然显示。pin 无解面板复用 `NoSolution`，读带 pin 点名
的 `infeasibility.reasons`。

## Risks / Trade-offs

- [被钉者临时并回池子] `legal_pairs(available + [pin])` 每条 pin 线多一次小构造——被钉者已从
  `available` 剔除，不会和自己配对（`combinations` 里 pin 只与 available 成员配）。O 阶不变。
- [半填语义变更是 BREAKING] 以前半填被忽略、现在成 pin。旧分享链接若恰好半填过某线，重开后
  行为变了 → 但半填以前不产生任何约束、结果本就是自由搜索，新语义只会更贴近用户当时的意图；
  可接受，proposal 已标 BREAKING。
- [冲突校验遗漏] 四类冲突若漏一类会静默偏向 → 每类各配一个 422 测试。

## Migration Plan

无 schema/migration。纯参数 + 引擎 + 前端。后端先部署（认 `pin=` 参数），前端随后；旧前端不发
`pin=`，后端照常。回滚 = 去掉 pin 分支，行为回到「半填忽略」。

## Open Questions

（探索阶段 4 条已解决：D1 编码、D3 诊断签名、D2 引擎剪枝、D5/mock 视觉。无遗留。）
