## 1. 后端：比赛记录表 + CRUD + 整场算分

### Contract
- **Spec**:
  - 管理员（通过 `canEdit(season, division)`）SHALL 能录入一场已打完的比赛，含：日期（必填）、对手队（同一 (season, division) 的另一支队）、轮次（可选自由文本）、我方逐线上场球员、对手逐线上场球员、每线一个 win/loss 结果、每线一段可选自由文本备注。写 SHALL 经受保护写路由（`WRITE_METHODS` 中间件自动保护）并带 scope `{season, division}`。对手队 MUST 校验为同组另一支队，跨组或自己对自己 SHALL 拒绝。
  - 比赛的我方阵容 SHALL 存为该比赛自己的快照 `{line: [player keys]}`，而非外键引用某套已存阵容。比赛 SHALL 存一个可空 `source_lineup_id` 仅作溯源；该 `source_lineup_id` 指向的 saved_lineup 被删或改名后，比赛记录仍 SHALL 完整显示其阵容快照。
  - 对手逐线上场球员 SHALL 引用对手队当季名单里的 player。个别对不上的位置 SHALL 留空，读侧用「没有值」表示而非 0 或哨兵。
  - 每线 SHALL 存一个 win/loss 结果与一段可选备注。整场胜负 SHALL 由逐线结果按该 division 的 `scoring_mode` 自动计算（`match_count` 数赢线、`points` 按线位加权）；该整场值 SHALL 只读、从不接受手填，始终以逐线结果为准。
- **Runtime**: `cd backend && uv run pytest tests/test_match_records.py` → expected: 全部通过，无 import 错（本机按 CLAUDE.md 走 `backend/.venv-std/Scripts/python.exe -m pytest tests/test_match_records.py`）
- **Code**:
  - 单表 `zijing_cup.match_records` + JSONB `lines`（`{line:{our:[keys],opp:[pid|null],outcome,note}}`），写入侧 pydantic 逐线校验（outcome 枚举 / our 恰两 key / note 长度 / opp int|null），不裸塞 JSONB（design D1）。
  - 整场胜负纯推导、不落库列：读时按 `division_lines`+`scoring_mode` 算，部分录入只统计已录线（design D2）。
  - `source_lineup_id` 可空 int、无 FK（照 saved_comparison 范式，删 saved_lineup 不碰记录）（design D4）；`match_date` 存 DATE、用户录入、无 tz 风险（design D5）。
  - migration `set search_path` 打头、schema-qualified、composite FK `(season_year,division_code)`→divisions、对手≠我方校验；远程 Dashboard 手工执行（no-CLI-push）。
- **Threshold**: 80

