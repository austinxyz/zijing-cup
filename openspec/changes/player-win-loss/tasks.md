# Tasks — player-win-loss

Test runner note: 本机 `uv run` 被 Application Control 拦，后端命令走
`backend/.venv-std/Scripts/python.exe -m pytest ...`（见 CLAUDE.md）。CI 仍以 uv 为准。

## 1. players 胜/负字段 + migration

### Contract
- **Spec**: (player-registry) 队员 SHALL 带一对可空的整数 `wins` / `losses`（生涯战绩，
  跨赛季，最新一次导入为准）。两者皆可空：`null` 表示从未导入过战绩，与 `0`（真的 0 胜或
  0 负）是不同的断言，MUST NOT 用 0 表示未知。总场次与胜率 MUST NOT 入库。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/players/ -q` → expected:
  模型/migration 相关测试通过；`wins`/`losses` 默认 None、可存整数。
- **Code**: D1 —— 只存两整数、不存派生量；可空且默认 null（不用 server_default，None=NULL
  正是意图，与时间戳那条 NOT NULL 陷阱相反）。migration 以 `set search_path to zijing_cup,
  public;` 开头；本地打 127.0.0.1、远程 Dashboard 手工执行、禁 CLI push。
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/player-win-loss/contracts/group-1.md with the ### Contract block above; confirm all three fields non-empty
- [ ] 1.1 RED — test: 新建 Player 默认 `wins is None`、`losses is None`；赋 67/20 存取回来相等（backend/tests/players/）
- [ ] 1.2 GREEN — `app/models/players.py`：Player 加 `wins: Optional[int] = None`、`losses: Optional[int] = None`；写 `supabase/migrations/<ts>_player_win_loss.sql`（search_path + add column wins/losses int 可空）；本地断言 127.0.0.1 后打到本地栈
- [ ] 1.3 RED — test: migration SQL 含 `zijing_cup` 限定/search_path 且两列可空（读文件断言，或迁移后查列可空）
- [ ] 1.4 GREEN — 调整 migration 至通过
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 2. 导入读胜/负（parse + diff + apply）

### Contract
- **Spec**: (current-utr-io) CSV 导入 SHALL 识别当前 UTR 表末尾的 `胜`、`负`两列，把它们写进
  队员的 `wins`/`losses`。`总场次` 与 `胜率` SHALL 被忽略。胜/负 SHALL 进导入的预览 diff
  （计入字段计数，防整列错位悄悄写入），并随既有全有或全无规则一起落库。只带前八列的表导入
  时 SHALL 对战绩产生 0 处改动。空单元格皆空 = 不动那名队员的战绩。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/ -q -k "sheet or utr"` → expected:
  解析读到胜/负、diff 计数含 wins/losses、apply 写库、坏值整批回滚、8 列表往返 0 改动，全绿。
- **Code**: D2 —— 导出 `COLUMNS` 保持 8 列不动；`_row_from_cells` 读 cell(9)/cell(10) 写进
  `SheetRow.wins/losses`（尾列缺失=""）。D3 —— 加进 `FIELDS`、`_changed_fields` 显式 pairs；
  整数按 `str(existing)==written` 判等（不进 `_NUMERIC_FIELDS`）；`_typed` 加 int 分支；
  `_winloss_errors` 校验非负整数、坏值行级报错整批回滚；空=跳过、`-`=清空沿用既有语义；
  `PlayerView`/`_diff_for` 带 wins/losses；`_is_blank` 纳入两列。
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/player-win-loss/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — test: `parse_sheet` 读 12 列一行 → `SheetRow.wins=="67"`、`losses=="20"`；8 列行 → 两者 `""`
- [ ] 2.2 GREEN — `SheetRow` 加 `wins/losses`；`_row_from_cells` 读 cell(9)/cell(10)；`_is_blank` 纳入
- [ ] 2.3 RED — test: `diff_sheet` 对 `wins` 变化产生 `FieldChange(field="wins")` 且 `counts["wins"]==1`；未变不产生；`str` 整数判等（person.wins=67 vs "67" 无改动）
- [ ] 2.4 GREEN — `FIELDS` 加 wins/losses；`_changed_fields` 加两 pairs；`PlayerView` 加两字段
- [ ] 2.5 RED — test: 胜/负为 `abc`/`-5`/`7.5` → 行级 SheetError、`applicable` False（整批回滚）；`-` → 清成 None
- [ ] 2.6 GREEN — `_winloss_errors`（非负整数校验）接进 `diff_sheet` 的 row_errors；`_typed` int 分支
- [ ] 2.7 RED — test: `apply_sheet` 写 12 列表后 person.wins/losses 落库；只带 8 列的表往返 → 战绩 0 改动
- [ ] 2.8 GREEN — `_diff_for` 的 `PlayerView` 带 wins/losses；确认 apply setattr 循环覆盖（无需专门分支）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 3. 花名册响应带胜/负

### Contract
- **Spec**: (team-roster) `get_team_roster` 的每名队员 SHALL 带出 `wins`/`losses`（生涯战绩，
  来自 players）。两者可空，MUST NOT 用 0 或哨兵冒充「未知」。胜率是显示派生量，后端不算、
  不带出——只带 `wins`/`losses` 两个整数。
- **Runtime**: `backend/.venv-std/Scripts/python.exe -m pytest backend/tests/rosters/ -q` → expected:
  花名册响应含 wins/losses；有战绩带整数、未导入带 null，全绿。
- **Code**: D4 —— `RosterPlayerOut` + `get_team_roster` 加 `Optional[int]` 两字段；后端不算胜率。
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/player-win-loss/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — test: `get_team_roster` 某队员 wins=67/losses=20 → 响应带这两个整数；未导入队员 → 两者 null（backend/tests/rosters/）
- [ ] 3.2 GREEN — `app/rosters/query.py`：`RosterPlayerOut` 加 wins/losses；`get_team_roster` 从 player 带出
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 80 → PASS; < 80 → append FIX tasks + retry

## 4. 队伍页胜率列 + 类型 + 导入预览标签

### Contract
- **Spec**: (team-roster-ui) 队伍页只读花名册 SHALL 显示一列「胜率」：`胜-负` 与百分比
  （`胜/(胜+负)` 前端派生、四舍五入到整数）。桌面表与手机卡片都 SHALL 显示。任一为 null 时
  SHALL 显示 `—`，MUST NOT 显示 `0-0`/`0%`。分母为 0 时百分比 SHALL 显示 `—`，MUST NOT 除零。
  撑不下沿用既有横滚，MUST NOT 令页面横向溢出。
- **Runtime**: `cd frontend && npm run test -- RosterTable win` (+ `npx tsc --noEmit`) → expected:
  胜率列渲染 `67-20`/`77%`、null → `—`、0-0 → 百分比 `—`；tsc 干净。
- **Code**: D4 —— `lib/api.ts` 的 `RosterPlayer` 加 `wins: number | null`、`losses: number | null`
  （后端漂移红 tsc）。D5 —— 显示 helper 三态：任一 null → `—`；和为 0 → `0-0` + 百分比 `—`；
  否则 `胜-负` + `round(w/(w+l)*100)%`。桌面 thead+row 与手机卡片都加；导入预览的 field→中文
  标签补 `wins`→「胜」`losses`→「负」，否则预览显示原始字段名。
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/player-win-loss/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — test: RosterTable 某队员 67/20 → 出现 `67-20` 与 `77%`；null/null → `—`；0/0 → `0-0` 且百分比 `—`（frontend，jsdom）
- [ ] 4.2 GREEN — `lib/api.ts` `RosterPlayer` 加 wins/losses；`RosterTable.tsx` 桌面表 + 手机卡片加胜率列 + 显示 helper
- [ ] 4.3 RED — test: 导入预览把 `wins`/`losses` 字段名显示成「胜」「负」（若预览标签有测试点）
- [ ] 4.4 GREEN — 补预览 field→中文标签 map 的 wins/losses 项
- [ ] 4.5 VISUAL DIFF — 起 dev stack，开队伍页（补种后有战绩的队），核对胜率列在桌面 + 375 均显示、缺失 `—`、不横向溢出
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + specs + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores; total ≥ 70 → PASS; < 70 → append FIX tasks + retry

## 5. 验证

- [ ] 5.1 Run superpowers:verification-before-completion — 跑后端 pytest（`.venv-std`）+ 前端 `npm run test` + `npx tsc --noEmit`；审计无 console.log；确认导入真跑一遍（curl apply）落库、队伍页真渲染胜率列。注意 CLAUDE.md：跑完 pytest 本地库会空，视觉核对前先补种，顺序=先测试→再补种→再视觉。
