### Contract
- **Spec**: notes-surfacing —— 「roster 编辑模式（`canEdit && editing`）启用编辑；追加/删除经既有
  `addPlayerNote`/`deletePlayerNote`（按比赛 scope、成功 revalidate）」；「排阵/对手对比/roster 查看模式
  MUST 保持只读——不传可编辑标志」。
- **Runtime**: `cd frontend && npm run test -- "teams/[code]" lineup compare` + `npx tsc --noEmit` → expected: roster 编辑模式下 badges/入口拿到 editable + 绑定 actions 的单测过；查看模式与排阵/对比仍只读（不传 editable）的单测过；tsc 干净、既有只读测不回归。
- **Code**: `TeamEditPanel` 读 `useTeamEdit()` 的 `canEdit && editing` 作 editable，连同绑定好的 `addPlayerNote`/`deletePlayerNote`（season/division/playerId）传给 `RosterTable` → 移动卡 + 桌面行两处 `PlayerNotesBadges`。server action 直接 import 调用（沿用 `NotesSection` 模式，可跨 server→client）。排阵（`CandidateCards`/`SavedLineups`→`LineBlock`）与 `compare/page` **不传** editable，保持只读不回归。
- **Threshold**: 80

