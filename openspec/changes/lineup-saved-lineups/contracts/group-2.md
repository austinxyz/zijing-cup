### Contract
- **Spec**: 校验端点 SHALL 接收一套 5 线 × 2 key 的 assignment，用**当前**参赛 UTR 解析后跑既有 `check_lineup` 回 violations（结构化、复用 `Violation` 中文 message），MUST NOT 复制合法性逻辑。引用 key 走与手填 URL 完全相同校验（未知→4xx、旧格式→stale-link）；重复上场等冲突由 `check_lineup` 据实报、MUST NOT 预拦。端点是 POST（body=assignment），被方法判权自动要求 admin。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_saved_lineups.py -k validate` → expected: 合法 assignment 回空 violations、各类非法（超cap/buffer/差距/重复/资格）回对应 violations、未知/旧 key 4xx、无凭据被拒
- **Code**: D3 `POST /.../teams/{team}/saved-lineups/validate`，body `{assignment:{线:[a,b]}}`；`load_roster` 当前值解析（`_reject_old_keys`），组 lineup 跑 `check_lineup`，回 `{violations:[{code,line,amount,message}]}`。不新增合法性代码。POST 自动 admin-gated（编辑是 admin 动作）。
- **Threshold**: 80
