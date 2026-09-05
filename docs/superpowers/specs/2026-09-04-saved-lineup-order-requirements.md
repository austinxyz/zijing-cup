---
Date: 2026-09-04
Change: saved-lineup-order
Status: REVIEWED
HAS_UI_SURFACE: no
---

# saved-lineup-order — 已存阵容排序 + 克隆

阵容页的已存阵容当前按名字（`name`）排序，队长无法把常用阵容排在前面，也没法在一个
阵容基础上快速改出一个变体。这个 change 给已存阵容加一个可编辑的顺序（拖拽 + ↑/↓），并
支持克隆一个已存阵容。

## Goals

1. **顺序（`sort_order`）。** `saved_lineups` 加 `sort_order`（int）。列表按 `sort_order`
   升序、id 升序兜底排序，取代当前的按 `name` 排序。新存的阵容排在末尾（该队 max+1）。
2. **重排（拖拽 + ↑/↓）。** 管理员可改顺序：桌面原生 HTML5 拖拽，手机用每行的 ↑/↓ 按钮
   （native DnD 触屏不可靠）。前端把**整份有序 id 列表**发给后端一个重排端点，后端按位置
   赋 `sort_order`（幂等、抗竞态；只认本队的 id）。
3. **克隆。** 管理员可克隆一个已存阵容：**原样复制** `assignment` 与 `utr_snapshot`（是当时
   那份的真拷贝，不重新按当前 UTR 快照），名字 `<原名> 副本`，若已存在则 `副本2`/`副本3`…；
   排在末尾。受该队 50 条上限约束。

## Non-Goals

- 不做跨队排序/克隆（顺序是每队私有的）。
- 不排序候选阵容（候选是引擎实时算的，本就按分排）。
- 不动 saved 的重判逻辑（`revalidate_saved`）、UTR 快照语义、编辑/保存回写。
- 不做多选批量重排/批量克隆。

## Constraints

- 架构不变：浏览器→Next→FastAPI→DB；写鉴权按 HTTP 方法判（新写端点默认受保护）。
- `zijing_cup` schema；migration 是唯一来源；远程共享库不跑 CLI push——去 Dashboard 手工
  执行、本地打 127.0.0.1；**带 migration 的 change，push 前先确认远程已执行否则线上 500**。
- `sort_order` 建为 `int not null default 0`，migration 内**按 name 回填**现有行（`row_number`
  over (team_id order by name)），使现有顺序在切到 sort_order 后不变。
- `(team_id, name)` 仍唯一 → 克隆命名必须去重（`副本`→`副本2`…），否则 409/覆盖。
- 重排端点全有或全无：一份坏的 id 列表（含别队 id 或缺 id）整体拒绝，不写一半。
- 手机版式沿用 mobile-shell：↑/↓ 按钮 44px 目标；拖拽在触屏上不作为唯一手段。

## Success Criteria

1. `saved_lineups` 有 `sort_order`；列表按 (sort_order, id) 返回；现有行迁移后顺序 = 原按名。
2. 新存阵容 `sort_order` = 该队现有 max+1，排末尾。
3. 重排端点接收有序 id 列表 → 按位置写 `sort_order`；再次发同一列表 0 变化（幂等）；列表含
   别队 id 或与该队集合不一致 → 422 整体拒绝、顺序不变。
4. 克隆产生新行：`assignment`/`utr_snapshot` 与源**逐字节相等**，名字 `<原名> 副本`（去重
   到 `副本N`），`sort_order` 末尾；超 50 条上限 → 409。
5. 前端：桌面可拖拽改序、手机 ↑/↓ 改序，落库后刷新顺序不回弹；每行有「克隆」；`SavedLineup`
   类型带 `sort_order`；`npx tsc --noEmit` 干净。
6. 后端 + 前端测试覆盖：排序、max+1、重排幂等与拒坏列表、克隆逐字节 + 去重命名 + 上限、
   前端重排调用发全量有序 id、克隆调用。

## User Stories

- 作为队长，我把最常用的两套阵容拖到最前，之后每次打开都在顶部。
- 作为队长，我在手机上用 ↑/↓ 把一套阵容往上挪。
- 作为队长，我克隆一套已存阵容，得到「<原名> 副本」，在它上面改一条线再另存。

## Open Questions

（无——重排走全量有序 id、克隆逐字节复制 + `副本N` 去重、HAS_UI_SURFACE 判为 no（现有
组件上的增量控件），均已定。）

## Referenced Capabilities

- `lineup-saved-lineups`（修改）：`saved_lineups.sort_order` + migration；`list_saved_lineups`
  改按 (sort_order, id)；`save_lineup` 设 max+1；新增 `reorder_saved_lineups`（全量有序 id →
  按位置写）与 `clone_saved_lineup`（逐字节复制 + `副本N` 去重 + max+1 + 50 上限）；
  `SavedLineupOut`/`_serialize_saved` 带 `sort_order`；两个新写端点（PATCH 重排、POST 克隆）。
- `lineup-ui`（修改）：`SavedLineups` 组件加桌面拖拽 + 手机 ↑/↓ 重排与「克隆」按钮；
  `lib/api.ts` 的 `SavedLineup` 带 `sort_order` + `reorderSavedLineups`/`cloneSavedLineup`；
  lineup 页的 server actions 加重排与克隆。
