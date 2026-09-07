### Contract
- **Spec**: team-roster-ui —— 「搜现有…选中一人 → 经 `adminWrite` `POST /players/{id}/memberships`（body 含本队 `team_id`）」；「建新人…先 `POST /players` 建全局队员 → 再 POST membership」；「`DELETE /players/{id}/memberships/{membership_id}`…`membership_id` 由前端用 `getPlayer(player_id)` 找到该队员在本队的 membership 解析」；「后端拒绝时 SHALL 就地显示后端 detail，MUST NOT 静默失败」。
- **Runtime**: `cd frontend && npm run test -- teams` → expected: 四个 server action 的单测（mock `adminWrite`/`getPlayer`）过；`npx tsc --noEmit` 干净。
- **Code**: `addExistingPlayerToTeam`/`createAndAddPlayer`/`removePlayerFromTeam`/`searchPlayersForAdd` 加进 `teams/[code]/actions.ts`，均经 `adminWrite`（scope `{season,division}`）；`createAndAddPlayer` gender `""→null`（词表只收 M/F/null）；`removePlayerFromTeam` 用 `getPlayer` 按 `team_id` 定位 membership_id 再 DELETE，找不到抛清晰错误；成功 `revalidatePath` 队伍页；错误 detail 冒泡不吞。
- **Threshold**: 80

