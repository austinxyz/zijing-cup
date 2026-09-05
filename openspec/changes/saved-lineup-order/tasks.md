# Tasks — saved-lineup-order

Test runner note: 本机 `uv run` 被 Application Control 拦，后端命令走
`backend/.venv-std/Scripts/python.exe -m pytest ...`（见 CLAUDE.md）。saved-lineups 写测试需
`BACKEND_SECRET`/`ADMIN_SECRET` 前缀（纯模块先 import app 会让密钥为 None → 403 假阳性）。

## 1. sort_order 列 + 排序 + max+1 + 响应

### Contract
- **Spec**: (lineup-saved-lineups) 每个已存阵容 SHALL 带一个整数 `sort_order`。列表 SHALL 按
  `(sort_order 升序, id 升序)` 返回，取代按 `name` 排序。新存的阵容 SHALL 取该队现有
  `sort_order` 的最大值 +1。`sort_order` 随 `SavedLineupOut` 带出。迁移现有行时 SHALL 按原
  `name` 顺序回填。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q` → expected:
  列表按 (sort_order,id)、新存 max+1、响应含 sort_order，全绿。
- **Code**: D1 —— `sort_order int not null default 0`，migration 内 `row_number() over(partition
  by team_id order by name)` 回填；`set search_path to zijing_cup` 开头；本地打 127.0.0.1、远程
  Dashboard 手工执行、禁 CLI push。D2 —— `list_saved_lineups` 改 `order_by(sort_order, id)`；
  `save_lineup` 新行分支 `max(sort_order)+1`，upsert 到已有行不动 sort_order。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/saved-lineup-order/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — test: 两条已存阵容 sort_order 0/1 → 列表按此序；名字逆序也不改序（backend/tests/test_saved_lineups.py）
- [ ] 1.2 GREEN — `app/models/saved.py` 加 `sort_order`；写 migration（search_path + add column + 回填）；本地断言 127.0.0.1 后打本地栈；`list_saved_lineups` 改 order_by
- [ ] 1.3 RED — test: 新存阵容 sort_order = 该队现有 max+1；`SavedLineupOut` 响应含 sort_order
- [ ] 1.4 GREEN — `save_lineup` 新行 max+1；`SavedLineupOut` + `_serialize_saved` 加 sort_order
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 2. 重排端点（全量有序 id）

### Contract
- **Spec**: (lineup-saved-lineups) 重排 SHALL 接收该队已存阵容的整份有序 id 列表，按位置写
  `sort_order`。SHALL 幂等。列表与该队当前 id 集合不一致（含别队 id、缺项、重复）SHALL 整体
  拒绝（422）且不写任何一行。仅由方法判权中间件保护的写端点可达。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q -k "reorder or order"` → expected:
  按位置写、幂等、坏列表 422 整体拒，全绿。
- **Code**: D3 —— 端点体 `{"order": [id,...]}`；校验列表**恰好等于**该队当前 id 集合（无重复/
  无缺项/无别队 id）→ 否则 422 不写；相等则按下标写 `sort_order=0..n-1`。全量而非 per-move
  （幂等、抗竞态）。PATCH，方法判权自动保护。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/saved-lineup-order/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — test: 发 `[c,a,b]` → 三行 sort_order 0/1/2、列表随之；再发同一列表 0 改动（幂等）
- [ ] 2.2 GREEN — `reorder_saved_lineups(session, team_id, ordered_ids)`（集合校验 + 按位置写）；PATCH `_SAVED/order` 端点
- [ ] 2.3 RED — test: 列表含别队 id / 缺该队某 id / 有重复 → 422，顺序不变
- [ ] 2.4 GREEN — 校验分支（不一致 → 抛错 → 422）；确认整体不写
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 3. 克隆端点

### Contract
- **Spec**: (lineup-saved-lineups) 克隆 SHALL 新建一行，`assignment`/`utr_snapshot` 与源逐字节
  相等（不重新快照）。新名字 SHALL 为 `<原名> 副本`，重名则 `副本2`/`副本3`…。新行 `sort_order`
  末尾。SHALL 计入 50 条上限（达上限 → 409）。仅由方法判权中间件保护的写端点可达。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_saved_lineups.py -q -k "clone"` → expected:
  逐字节复制、`副本N` 去重、max+1、50 上限 409，全绿。
- **Code**: D4 —— `clone_saved_lineup(session, team_id, saved_id)`：读源（不属该队 → 404），
  新行 `assignment`/`utr_snapshot` 原样赋值（**不**调 `_snapshot_for`）；名字 `<原名> 副本` 起，
  `(team_id,name)` 冲突则 `副本2`… 探测第一个空位；`sort_order` max+1；复用 `MAX_SAVED_PER_TEAM`。
  POST `_SAVED/{id}/clone`，方法判权自动保护。
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/saved-lineup-order/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — test: 克隆 → 新行 assignment/utr_snapshot 与源相等、名字 `<原名> 副本`、sort_order 末尾
- [ ] 3.2 GREEN — `clone_saved_lineup`（逐字节复制 + max+1）+ POST `_SAVED/{id}/clone` 端点
- [ ] 3.3 RED — test: `<原名> 副本` 已存在 → 新名 `副本2`；该队满 50 → 409；源 id 属别队 → 404
- [ ] 3.4 GREEN — `副本N` 去重探测 + 上限检查 + 归属校验
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 4. 前端：拖拽 + ↑/↓ 重排 + 克隆

### Contract
- **Spec**: (lineup-ui) 已存阵容列表 SHALL 让管理员改顺序：桌面 HTML5 拖拽，手机每行 ↑/↓
  （44px，触屏 MUST 有非拖拽手段）。改序后 SHALL 发整份有序 id 列表；落库后刷新顺序 MUST NOT
  回弹。每行 SHALL 有「克隆」按钮。控件仅管理员显示。`SavedLineup` 类型 SHALL 带 `sort_order`。
- **Runtime**: `cd frontend && npx vitest run app/[season]/[division]/lineup/[code]/SavedLineups.test.tsx` (+ `npx tsc --noEmit`) → expected:
  ↑/↓ 交换并调重排、克隆调用、非管理员无控件；tsc 干净。
- **Code**: D5 —— `SavedLineups` 维护本地有序 state（初值后端序），拖拽/↑↓ 改 state 后调
  `reorderSavedLineups(全量 id)`，成功 `router.refresh()`、失败回滚 + role=alert；克隆调
  `cloneSavedLineup(id)` 后 refresh；行 key 用 saved.id。`SavedLineup` 加 `sort_order`（后端漂移
  红 tsc）。控件 `canEdit` 门控。
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/saved-lineup-order/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — test: 点某行 ↑ → 与上一行交换且调 reorder action（发全量有序 id）；点克隆 → 调 clone action；非 canEdit 无 ↑/↓/克隆（SavedLineups.test.tsx，jsdom）
- [ ] 4.2 GREEN — `lib/api.ts` `SavedLineup.sort_order` + `reorderSavedLineups`/`cloneSavedLineup`；lineup `actions.ts` 两个 server action；`SavedLineups.tsx` 拖拽 + ↑/↓ + 克隆 + 本地 state/回滚；`page.tsx` 接线
- [ ] 4.3 VISUAL DIFF — 起 dev stack，管理员登录（requestSubmit），桌面拖拽改序 + 克隆、手机 375 用 ↑/↓，核对落库后不回弹、控件 44px、无横向溢出
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 5. 验证

- [ ] 5.1 Run superpowers:verification-before-completion — 后端 pytest（`.venv-std` + 双密钥）+ 前端 `npm run test` + `npx tsc --noEmit`；审计无 console.log；curl 重排/克隆端点确认落库；管理员真渲染核对拖拽/↑↓/克隆。顺序固定：先测试 → 再补种 → 再视觉核对（跑完 pytest 本地库会空）。
