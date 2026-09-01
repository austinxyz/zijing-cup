### Contract
- **Spec**: 导出与导入 SHALL 使用同一套列，且原样导出、原样导回时 SHALL 产生 0 处改动。导入 SHALL 用每行的 `id` 定位队员，MUST NOT 用姓名匹配，也 MUST NOT 在 `id` 缺失或不认识时回退到姓名。姓名同行带回，仅用于校验。空白 = 不改；清空要显式写记号（`-`）；值与状态必须成对，只给一个的行 SHALL 被判为错误。状态列 SHALL 只接受 `unrated` / `projected` / `rated`，比对大小写不敏感，其他值 SHALL 判为错误，MUST NOT 猜测或映射。`UTR链接` 列 SHALL 同时接受完整链接与纯数字 ID，无法取出 ID 时 SHALL 判为错误而非存下原文。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_utr_sheet.py -q` → expected: 全部通过；测试不触碰数据库
- **Code**:
  - D6：`backend/app/players/utr_sheet.py`，纯函数，签名不带 `Session`。TSV 与 CSV 在解析入口归一成同一种行结构，之后共用一条路径。
  - D2：`id` 缺失或不认识时 **MUST NOT** 回退到姓名匹配 —— 那等于在最需要保证的一刻把 D1 撤掉。这条要有专门的测试。
  - D3：三种「空」各自有测试；只有值没状态、只有状态没值都要报错。
- **Threshold**: 80
