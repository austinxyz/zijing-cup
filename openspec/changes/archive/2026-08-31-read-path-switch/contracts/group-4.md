### Contract
- **Spec**: 导入器 SHALL 拒绝执行，或在执行前后刺眼地说明这些行不会出现在任何页面上。MUST NOT 只输出「+N 行」。拒绝 SHALL 可以被一个显式的开关绕过；绕过时仍 SHALL 打印同一条说明。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_roster_import.py -q` → expected: 全部通过，含拒绝与绕过两条新用例
- **Code**:
  - D8：用显式开关 `--i-know-it-is-not-read`，不用环境变量——绕过这件事该出现在命令历史里，而不是藏在某个 shell 的环境里被忘记。
  - 拒绝时 MUST NOT 写入任何数据，且以非零码退出。
- **Threshold**: 80
