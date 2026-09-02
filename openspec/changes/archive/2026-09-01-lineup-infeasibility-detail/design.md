## Context

`search_lineups()`（[search.py:262](backend/app/lineups/search.py)）在任一条线的 `options[code]` 为空时提前返回 `SearchResult(infeasible_line=code, placements=...)`。`options[code]` 由 `legal_pairs()` 产出：对 `available`（roster 去掉排除、再去掉锁进任何线的人）里每一对，顺序过四关——`_slot_ok`（性别组合）、`partner_gap_max`（搭档差距）、`cap + min(buffer_per_line, buffer_total)`（本线余量）、以及资格线限制。全被刷掉就空。**原因在过滤时丢了**：调用方只拿到线 code。

`placements`（`_placements(locks, blocked)`）已经把每个不可用的人映射到「锁进的线 code」或 `"excluded"`，是读输入即得的。`invalid_locks`（锁本身非法）走的是另一条更早的分支（`check_locks`），本次不动。

## Goals / Non-Goals

**Goals:**
- `infeasible_line` 时多返回一个结构化诊断：为什么这条线候选池为空，覆盖性别人手不足 / 都超 cap / 都超差距 / 资格四类，多因并存全列。
- 可直接读出时归因到用户动作（排除 / 锁进别线），点名 + 去向；资格/cap/差距不归因到用户。
- 只读候选池分析，不触发第二次搜索，不断言「哪条锁导致无解」。
- 前端 `NoSolution` 呈现原因 + 归因。

**Non-Goals:**
- assignment 级无解（两线抢同一人）。
- 改 `invalid_locks`。
- 因果猜测。
- 存储 / per-user / B、C 两条后续 change。

## Decisions

### D1 — 独立诊断结构，不复用 `Violation`

`SearchResult` 加一个字段：

```python
@dataclass(frozen=True)
class InfeasibilityReason:
    kind: str            # "gender_shortage" | "over_cap" | "over_gap" | "eligibility"
    message: str         # 面向队长的中文，数值已格式化成字符串
    attributed: list["PlacedPlayer"] = field(default_factory=list)

@dataclass(frozen=True)
class PlacedPlayer:
    name: str
    where: str           # 线 code（如 "MD"）或 "excluded"

@dataclass(frozen=True)
class Infeasibility:
    line: str
    reasons: list[InfeasibilityReason]

# SearchResult 新增：
infeasibility: Optional[Infeasibility] = None
```

`infeasible_line` 保留（向后兼容 + 简单场景）；`infeasibility` 是它的富化版，`line` 与 `infeasible_line` 同值。

**为什么不复用 `Violation`**：`Violation`（`code/line/amount/message`）是为锁本身非法设计的，没有 `attributed` 槽，且前端把它渲染成锁错误列表——语义与「这条线为什么没人」不同。硬塞会让两种很不同的东西挤进一个渲染路径。

### D2 — 诊断算法：只读 `available`，一趟过

新函数 `diagnose_line(rules, rule, available, placements) -> list[InfeasibilityReason]`，在 `options[code]` 为空、即将返回时对那条线调用一次。用与 `legal_pairs` **完全相同**的 `available` 池与四个判定，只是收集原因而非丢弃：

1. **性别人手不足**（先查，最省）：按这条线的 slot 需要的性别数点 `available`。男双需 2 名男；女双需 2 名女；混双需 1 男 + 1 女，男不足与女不足**分别**报。某性别可用数 < 需要数 → 一条 `gender_shortage`，message「需要 N 名 X 队员，可用只 M 名」。
2. 若性别够，遍历 `_slot_ok` 通过的对，对每对记第一个失败的关：gap / cap / eligibility。没有任何对全过时：
   - 全部败在 cap → 一条 `over_cap`，message 带 cap 值与 buffer 余量。
   - 全部败在 gap → 一条 `over_gap`，带差距上限。
   - 因资格被挡 → 一条 `eligibility`，据实说「某人参赛 UTR 高于 X，按规则只能打某几条线」。
   - 混合失败原因则各出一条（多因并存）。

一趟 `combinations`，与 `legal_pairs` 同阶，无第二次整解搜索。

**apply 期修正**：原 `legal_pairs` 不看资格（`restricted_to_lines`），所以「某人被限制在别的线」永远不会让本线的 `options` 变空 → `infeasible_line` 不会为资格触发（资格只在搜索递归 `_eligibility_ok` 里事后拒绝）。`restricted_to_lines` 是「队员 × 线」的局部可判事实，`check_locks`（rules.py）对锁定对早就是这么判的。故把同一条局部过滤并入 `legal_pairs`（新 `_line_restriction_offenders`）：更早、更据实地剪枝，SILVER（`restricted_to_lines=None`）不受影响，全套既有测试通过。诊断的资格分支与它对齐。

**API 序列化**：`query.py` 的 `LineupSearchOut` 加 `infeasibility`（`InfeasibilityOut`/`InfeasibilityReasonOut`/`PlacedPlayerOut`），`to_output` 映射；前端经此消费。

### D3 — 归因边界（钉死）

归因只挂在 `gender_shortage` 上，且只针对**排除 / 锁进别线**：对该性别，遍历 `placements` 里 `where != <本线>` 的同性别队员，取名 + 去向填 `attributed`。

`over_cap` / `over_gap` / `eligibility` 的 `attributed` **恒为空**——它们是规则或队员自身属性，不是用户动作。资格用中性措辞。这直接落实 requirements 里「错的标签比没有标签更糟」与既有 `NoSolution` 免责声明。

### D4 — 前端

`lib/api.ts` 的 `LineupSearch` 加 `infeasibility?: { line, reasons: {kind, message, attributed: {name, where}[]}[] }`。`LineupStates.tsx` 的 `NoSolution` 读 `infeasibility`：有则渲染原因列表 + 归因 chips（视觉稿 [mocks.html](openspec/changes/lineup-infeasibility-detail/mocks.html)），无则退回现有「没有任何合法搭档」+ placements。既有免责声明句保留。

数值全用后端字符串，前端不做数值比较（守 `Decimal` 全程纪律）。

## Risks / Trade-offs

- [资格判定的近似] 完整资格是全局计数（`_eligibility_ok` 在每个节点跑）；单线诊断只能看「这个人在本线是否被 restricted_to_lines 挡」这个局部事实 → 只报可局部判定的资格原因，不声称全局资格结论；措辞限定在「按规则只能打某几条线」。
- [多因难分主次] 不猜主因，据实全列 → 与 requirements 一致；前端按固定顺序（人手→cap→差距→资格）渲染，避免抖动。
- [归因误导] 把 cap/差距/资格错标成用户造成 → D3 恒空 `attributed` + 中性措辞，测试断言这三类 `attributed == []`。

## Migration Plan

无 schema / migration。纯响应字段新增 + 前端渲染。旧客户端忽略新字段照常工作（`infeasible_line` 仍在）。部署：后端先行（Render），前端随后（Vercel）——顺序无关，字段是加法。

## Open Questions

（探索阶段 4 条已在此解决：D1 结构、D2 计数口径、D3 资格措辞与归因边界、D4/mock 视觉。无遗留。）
