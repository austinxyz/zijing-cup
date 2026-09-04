# Contract — Group 3

- **Spec**: 搜索 SHALL 校验上场十人里外援数 ≤ on_court_cap(school_count)，超过的阵容 MUST NOT 作为候选；school_count 未设时不拦且 `borrowed_players_checked` 为 false，已设时校验并置 true；`is_wildcard` 不参与。外援超上限的无解 SHALL 以专门原因类型 `borrowed_over_limit` 呈现，点名外援与超出量。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/ -k "lineup and (borrowed or infeasib)"` → expected: 上场校验/未设不拦/归因 测试通过
- **Code**: D2 `load_roster` 把 membership.borrowed 读进 `Candidate`（一处，候选与已存阵容都经它）；搜索/过滤阶段统计上场外援数 vs on_court_cap；null→跳过、`borrowed_players_checked` 随之；`diagnose_line`/infeasibility 加 `borrowed_over_limit`，点名用 `_display_name`（避免 tab 拼接）。
- **Threshold**: 80
