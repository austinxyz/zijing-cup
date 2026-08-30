# Contract — Group 2: 迁移命令

### Contract
- **Spec**:
  - 系统 SHALL 提供一条迁移命令，把 `roster_entries` 中 2025 与 2026 两个赛季的全部行读进
    新表：按规范化姓名（姓与名各自 `trim` 后转小写再拼接）归并成队员，每行生成一条成员
    关系，每行的参赛 UTR 生成 `(队员, 赛季)` 记录。
  - 迁移 MUST NOT 自行裁决冲突：同一队员同一赛季出现两个不同的参赛 UTR 时，标记为未裁决
    并保留两个值。
  - 迁移 SHALL 可重复执行而不产生重复数据。
- **Runtime**: `cd backend && uv run pytest tests/test_players_migrate.py` → expected: 全部通过，含归并按规范化姓名、金银两组不同值判为未裁决、重复执行不产生重复、两季全部行都被认领
- **Code**:
  - 归并与冲突判定是纯函数，输入是已读出的行、输出是决定，不碰数据库（D6）——这些规则要
    用虚构数据密集测试。
  - 命令形状与 `load_rules` / `load_rosters` 一致：解析 → 读现状 → 比对 → 只写差异，
    `--check` 复用同一个比对函数并转成退出码（D7）。**不写进 migration**：远程是手工在
    Dashboard 执行 SQL 的，几百行 DML 在那里既不可观测也不可重试。
  - **不做模糊匹配**（D2）：`Xie Yuntao "Young"` 这类别名与两栏填反的行，任何自动规则都会
    在一部分行上猜错且不留痕迹。
- **Threshold**: 80
