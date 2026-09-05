---
Date: 2026-09-04
Change: saved-lineup-order
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-09-04-saved-lineup-order-requirements.md
---

## Why

已存阵容当前按名字排序，队长无法把常用阵容置顶，也无法在一套阵容上快速改出变体。加一个
可编辑顺序（拖拽 + 手机 ↑/↓）与克隆即可解决，都是既有 saved-lineups 能力上的增量。

## What Changes

- **`saved_lineups` 加 `sort_order`**（int not null default 0，migration 内按 name 回填现有行
  保序）。列表改按 (sort_order, id) 排序；新存阵容 `sort_order` = 该队 max+1。
- **重排端点**（PATCH）：客户端发**整份有序 id 列表**，后端按位置写 `sort_order`；幂等；
  列表与该队 id 集合不一致（含别队 id 或缺项）→ 422 整体拒绝。
- **克隆端点**（POST）：逐字节复制 `assignment`/`utr_snapshot`，名字 `<原名> 副本`（去重到
  `副本N`），`sort_order` 末尾，受该队 50 条上限约束（→ 409）。
- **`SavedLineupOut` 带 `sort_order`**；前端 `SavedLineup` 类型 + `reorderSavedLineups`/
  `cloneSavedLineup` api 函数 + lineup 页两个 server action。
- **前端 `SavedLineups`**：桌面原生 HTML5 拖拽 + 手机每行 ↑/↓（44px）重排，每行「克隆」按钮。

## Capabilities

### New Capabilities

（无——修改两个既有能力 + 一处新 schema 列。）

### Modified Capabilities

- `lineup-saved-lineups` — `saved_lineups.sort_order` + migration；list 按 (sort_order, id)；
  save 设 max+1；新增 `reorder_saved_lineups`（全量有序 id → 按位置写、整体拒坏列表）与
  `clone_saved_lineup`（逐字节复制 + `副本N` 去重 + max+1 + 50 上限）；`SavedLineupOut`/
  `_serialize_saved` 带 `sort_order`；两个新写端点（PATCH 重排、POST 克隆，方法判权自动保护）。
- `lineup-ui` — `SavedLineups` 加桌面拖拽 + 手机 ↑/↓ 重排与每行「克隆」；`lib/api.ts` 的
  `SavedLineup` 带 `sort_order` + `reorderSavedLineups`/`cloneSavedLineup`；lineup 页 server
  actions 加重排与克隆。

## Impact

- **Schema / migration**：`saved_lineups.sort_order int not null default 0` + 按 name 回填现有行。
  远程 Dashboard 手工执行、本地打 127.0.0.1（禁 CLI push）；**push 前先跑远程否则线上 500**。
- **后端**：`app/models/saved.py`（加列）；`app/lineups/saved.py`（list 排序、save max+1、
  新增 reorder / clone）；`app/routers/lineups.py`（`SavedLineupOut` + `_serialize_saved` +
  PATCH 重排 + POST 克隆端点）。
- **前端**：`lib/api.ts`（`SavedLineup.sort_order` + 两个 api 函数）；lineup `actions.ts`
  （两个 server action）；`SavedLineups.tsx`（拖拽 + ↑/↓ + 克隆）；`page.tsx`（接线）。

## Out of Scope

- 跨队排序/克隆；候选阵容排序（引擎实时按分排）；多选批量重排/克隆。
- 改 saved 重判逻辑、UTR 快照语义、编辑/保存回写。
