### Contract
- **Spec**: 两个端点的数据来源 SHALL 是队员注册表（队员 / 赛季参赛 UTR / 队伍成员关系），MUST NOT 再读名单快照 `roster_entries`。名单的「人数」自此等于该队的成员关系条数，性别取自队员记录。响应的字段集合 SHALL 保持不变。`dutr_status` / `source_note` / `daily_utrs` 恒为 null。一名队员在该赛季没有参赛 UTR 时，端点 SHALL 返回按推导链取得的值及其来源标记，MUST NOT 因为缺值就把这名队员从名单里略去。性别为空的记录 MUST 单独计数。系统 MUST NOT 提供任何修改名单或球队的 HTTP 端点。
- **Runtime**: `cd backend && ./.venv-std/Scripts/python.exe -m pytest tests/test_roster_api.py -q` → expected: 全部通过；fixture 建在新表上，不再插入 `roster_entries`
- **Code**:
  - D5：`dutr_status` 当前是必填 `str`，要放宽成 `Optional[str]`。这是本次唯一的响应类型变更，且是放宽而非收紧。
  - D6：`rating_class` 由 `player_season_utrs.status` 直接映射（verified/committee/captain/null）；`under_appeal` 独立传出。
  - D7：`list_teams` 保持**一条**查询、保持外连接（无人的队仍出现且计数为零）、保持 `ORDER BY code`。改成 `Team LEFT JOIN PlayerTeamMembership JOIN Player`。
  - 名单排序照旧「参赛 UTR 降序，同值按姓」，且排序用推导后的值。
- **Threshold**: 80
