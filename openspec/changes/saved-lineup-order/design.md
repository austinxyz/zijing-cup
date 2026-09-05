## Context

已存阵容存在 `saved_lineups`（`app/models/saved.py`）：`id, team_id, name, assignment(JSONB),
utr_snapshot(JSONB), created_at, updated_at`，`(team_id, name)` 唯一。`app/lineups/saved.py` 的
`list_saved_lineups` 当前 `order_by(name)`；`save_lineup` 按名 upsert，受 `MAX_SAVED_PER_TEAM=50`
限制。路由 `app/routers/lineups.py`：GET 列表、POST 存、PUT 存回、DELETE，均 `_serialize_saved`。
前端 `SavedLineups.tsx`（client）从服务端拿 `SavedLineup[]`，按后端序渲染；写走 lineup 页
server actions → `adminWrite`。写鉴权按 HTTP 方法判（新写端点无需声明即受保护）。

## Goals / Non-Goals

**Goals:** 每队私有的可编辑顺序（拖拽 + 手机 ↑/↓）；克隆一个已存阵容。

**Non-Goals:** 跨队排序/克隆；候选阵容排序；多选批量；改重判/快照/回写语义。

## Decisions

### D1 — `sort_order int not null default 0`，migration 内按 name 回填
加一列而非引入排序表。`not null default 0` 让插入不必显式给值（与 `is_borrowed_player` 那类
可空三态不同——顺序没有「未知」态，0 是合法初值）。migration 用 `row_number() over (partition
by team_id order by name)` 回填现有行，使「切到 sort_order」当下顺序 = 原按名，用户看不出跳变。
- *备选*：可空 + 读时 coalesce —— 弃，顺序没有「未知」语义，可空只是把 0 换个写法。

### D2 — 列表按 `(sort_order, id)`；新存 max+1
`list_saved_lineups` 改 `order_by(sort_order, id)`。id 兜底保证 default-0 并列时稳定（迁移后
不会并列，但防御新插入竞态）。`save_lineup` 新行分支查该队 `max(sort_order)` +1；upsert 到
已有行时不动 `sort_order`（存回不改位置）。

### D3 — 重排收整份有序 id 列表，按位置写；坏列表整体拒
端点体 = `{"order": [id, ...]}`。校验该列表**恰好等于**该队当前 id 集合（同一集合、无重复、无
缺项、无别队 id）——不等则 422，不写。相等则按下标写 `sort_order=0..n-1`。发整份而非「把 X 移到
Y」：幂等、抗竞态（两个标签页各拖一次不会拼出错乱的半序），也让前端实现简单（本地重排后发全量）。
- *备选*：per-move（`{id, to_index}`）—— 弃，非幂等且并发下易拼错。

### D4 — 克隆逐字节复制 + `副本N` 去重 + max+1
新 `clone_saved_lineup(session, team_id, saved_id)`：读源行，新建行 `assignment`/`utr_snapshot`
**原样赋值**（真拷贝，不调 `_snapshot_for` 重新按当前 UTR 快照——克隆是「再来一份当时的它」，
不是「新存一份现在的它」）。名字 `<原名> 副本`，若 `(team_id, name)` 已存在则 `副本2`、`副本3`…
循环探测第一个空位。`sort_order` = max+1。复用 `MAX_SAVED_PER_TEAM` 检查（克隆是新增行）。
源 id 不属于该队 → 404。
- *备选*：克隆时重新快照 —— 弃，会让副本状态与原本在同一刻不一致，违背「真拷贝」直觉。

### D5 — 前端：本地重排即时反馈，落库用整份 id；拖拽 + ↑/↓ 双手段
`SavedLineups` 维护本地有序列表 state（初值来自 props 的后端序）。桌面 HTML5 拖拽
（`draggable` + `onDragStart/onDragOver/onDrop`），手机每行 ↑/↓（交换相邻）——同一 state 变更，
变更后调 `reorderSavedLineups(全量 id)`。落库成功后 `router.refresh()`；失败回滚本地序 +
role=alert。克隆按钮调 `cloneSavedLineup(id)` 后 refresh。`SavedLineup` 类型加 `sort_order`。
控件仅 `canEdit` 显示。

## Risks / Trade-offs

- [软导航/props 更新与本地 state 打架，顺序回弹] → 本地 state 以「最后一次成功落库序」为准，
  refresh 后 props 已是新序；失败才回滚。key 用 saved.id 避免行复用错位。
- [两标签页并发重排] → 全量 id + 集合校验：后到的一份若 id 集合已变（有人删了/加了）→ 422，
  提示刷新，而不是写出错乱半序。
- [远程 migration 未执行即 push] → 新代码读/写 `sort_order` → 线上 500。**push 前先 Dashboard
  执行**；这是带 migration 的 change 的既定纪律，不降级（核心查询降不了）。

## Migration Plan

1. `supabase/migrations/<ts>_saved_lineup_sort_order.sql`：`set search_path to zijing_cup, public;`
   + `alter table saved_lineups add column sort_order int not null default 0;`
   + `update saved_lineups s set sort_order = r.rn - 1 from (select id, row_number() over
     (partition by team_id order by name) rn from saved_lineups) r where r.id = s.id;`
2. 本地：断言连接串含 127.0.0.1 后打到本地栈。
3. 远程：Dashboard SQL Editor 手工执行，**先执行、后 push 后端**。
4. 回滚：`alter table saved_lineups drop column sort_order;`（无数据依赖）。

## Open Questions

（无——顺序列、重排全量 id、克隆逐字节 + `副本N`、前端双手段均已定。）
