### Contract
- **Spec**: (current-utr-io) CSV 导入 SHALL 识别当前 UTR 表末尾的 `胜`、`负`两列，把它们写进
  队员的 `wins`/`losses`。`总场次` 与 `胜率` SHALL 被忽略。胜/负 SHALL 进导入的预览 diff
  （计入字段计数，防整列错位悄悄写入），并随既有全有或全无规则一起落库。只带前八列的表导入
  时 SHALL 对战绩产生 0 处改动。空单元格皆空 = 不动那名队员的战绩。
- **Runtime**: `BACKEND_SECRET=test-secret ADMIN_SECRET=admin-secret backend/.venv-std/Scripts/python.exe -m pytest backend/tests/test_utr_sheet.py backend/tests/test_utr_api.py -q` → expected:
  解析读到胜/负、diff 计数含 wins/losses、apply 写库、坏值整批回滚、8 列表往返 0 改动，全绿（58 passed）。
  env 前缀是必须的：`app.auth` 在 import 时读 `BACKEND_SECRET`，纯模块 test_utr_sheet 先 import
  会让它为 None → 全 403，是既知的子集 import-order 假阳性（见 CLAUDE.md），非本改动缺陷。
- **Code**: D2 —— 导出 `COLUMNS` 保持 8 列不动；`_row_from_cells` 读 cell(9)/cell(10) 写进
  `SheetRow.wins/losses`（尾列缺失=""）。D3 —— 加进 `FIELDS`、`_changed_fields` 显式 pairs；
  整数按 `str(existing)==written` 判等（不进 `_NUMERIC_FIELDS`）；`_typed` 加 int 分支；
  `_winloss_errors` 校验非负整数、坏值行级报错整批回滚；空=跳过、`-`=清空沿用既有语义；
  `PlayerView`/`_diff_for` 带 wins/losses；`_is_blank` 纳入两列。
- **Threshold**: 80
