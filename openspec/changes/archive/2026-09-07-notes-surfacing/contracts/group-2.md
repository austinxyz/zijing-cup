### Contract
- **Spec**: notes-surfacing —— 「批量读评价端点」的前端出口；「取数失败降级、不拖垮宿主页：批量取评价
  失败 → 三处降级为『无评价』」（本组实现降级出口，接线在组 4）。seat player_id 是让排阵/对手对比按
  player_id 查 notes 的基础设施。
- **Runtime**: `cd frontend && npm run test -- api` + `npx tsc --noEmit` → expected: `getPlayerNotesBatch` 请求 URL、非 ok/抛错降级 `{}`、空 ids 不发请求 的单测过；tsc 干净（含新增 `player_id` 字段导致的 fixture 补齐）。
- **Code**: `lib/api.ts` 加 `getPlayerNotesBatch(ids): Record<number, PlayerNote[]>`（空数组直接 `{}` 不发请求；非 ok/异常一律 `{}`，与 `getPlayerNotes`/`getTeamPresets` 同款降级）；复用既有 `PlayerNote`。后端 lineup 查询把 `player.id` 带出，`LineupPlayer`/候选 seat 与前端 `LineSeat` 加 `player_id: number`（显式字段，不剥 key 前缀）。
- **Threshold**: 80

