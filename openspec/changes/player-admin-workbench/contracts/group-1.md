### Contract
- **Spec**: player-registry —— 「`list_players` 与 `count_players` SHALL 在现有 `q`、`season`、`team_id`、`unresolved` 之外，额外支持三个筛选维度，多维度以 AND 组合：`gender` 精确匹配 `Player.gender`；`team` 模糊 ilike 同时匹配 `Team.code` 与 `Team.display_name`（命中任一）；`year` 命中「该年有 `PlayerSeasonUtr` 或该年在某队名单」两者任一」；「`count_players` 的计数 SHALL 与 `list_players` 用同一套筛选，返回不受页上限影响的真实总数」。
- **Runtime**: `cd backend && BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret .venv-std/Scripts/python.exe -m pytest tests/ -k "player and (query or list or filter or count)"` → expected: 新筛选的单测全过、无 import 错（本机 uv 被 Application Control 拦，用 .venv-std 的签名解释器；CI 仍走 config 的 uv）。
- **Code**: `_filtered` 加 `gender`/`team`/`year` 三参数；`year` 用 `Player.id.in_(子查询 PlayerSeasonUtr) | Player.id.in_(子查询 membership-join-Team)` 的 OR，**不**并进 team 的 INNER join（否则变「该队且该年」而非任一）；`team` 模糊 join Team 后 `Team.code.ilike | Team.display_name.ilike`；`list_players` 仍按 id 去重；`count_players` 复用同一 `_filtered`。
- **Threshold**: 80

