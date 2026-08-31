### Contract
- **Spec**: 排阵取值时，一名队员该赛季的参赛 UTR SHALL 按以下顺序逐级回退，取到第一个有值的为准。标记 MUST 带上年份。这条链是组委会自己的算法，名单页与排阵引擎 SHALL 使用同一条链，对同一名队员给出同一个数字。搜索结果 SHALL 标出每个参与计算的数字是冻结值、估算值，还是取自未裁决冲突的较大值。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_chain.py -q` → expected: 全部通过，无 import 错误；测试不触碰数据库
- **Code**:
  - D1：链放在 `backend/app/players/utr_chain.py`，纯函数，签名不带 `Session`。写成 SQL 已被否决——第二步取决于 `current_doubles_status` 的字符串取值。
  - D2：`origin` 是枚举 `{frozen, current_doubles, prior_season}` 加 `origin_year`，中文文案在前端拼。后端 MUST NOT 返回拼好的中文串。
  - D3：`is_unresolved` 的行取 `value`（较大者），并把 `is_unresolved` 透传出去。
  - 第三步取**最近一个有值赛季**，不限于上一年。
- **Threshold**: 80
