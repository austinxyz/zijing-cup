### Contract
- **Spec**: 差异结果 SHALL 含本批中同时属于其他组别名单的队员。存在任何一条错误时，系统 SHALL 拒绝落库整批，MUST NOT 只写没有错误的那部分。差异结果 SHALL 含本表覆盖的人数以及该队未被本表包含的人数。经任一支球队的表改动后，该队员在所有赛季、所有组别页面上呈现的都是同一个值。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_api.py tests/test_utr_sheet.py -q` → expected: 全部通过
- **Code**:
  - D4：整批拒绝而不是「写好的那部分」—— 最常见的严重错误是整列粘错位，那时几乎每行都会出错；放行一半会让库里一半新一半旧，且没有记录说明哪一半是新的。
  - 跨组别查询要一次查完，不要每人一查。
- **Threshold**: 80
