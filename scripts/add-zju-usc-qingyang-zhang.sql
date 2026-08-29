-- 2026 银组 ZJU-USC：新增 Qingyang Zhang（张庆阳）
--
-- 来源：personal/tennis/紫荆杯银组/roster.md（2026-08-28 从 UTR "ZJ Silver 2026"
-- 拉取的名单，第 30 行）。线上该队当时是 29 人，md 是 30 人，差的就是这一位。
--
-- 单条 INSERT，不走 CSV 导入器：导入器是整份名单的 diff，喂一份只有一个人的
-- CSV 会把另外 29 人判成 removed。
--
-- match_utr 4.25 是人工指定值：她当前 UTR 是 0.00 / Unrated，md 里按人工指定
-- 记 4.25，Qualified 记「是」。
--
-- rating_class 留 NULL：Unrated 的人是 committee 还是 self_rated，取决于名单里
-- 没有的 USTA 比赛记录，按本项目的规矩由人来定，不在这里替它决定。
--
-- is_borrowed_player 留 NULL：md 没有说她算不算外援。NULL 是「没人标过」，
-- 和「确认不是外援」是两回事，后者会让阵容显示成查过而其实没查。

set search_path to zijing_cup, public;

insert into roster_entries (
    team_id,
    last_name,
    first_name,
    gender,
    match_utr,
    dutr_status,
    source_note,
    utr_profile_id
)
select
    t.id,
    'Zhang',
    'Qingyang',
    'F',
    4.25,
    'Unrated',
    '人工指定',
    '1698377'
from teams t
where t.season_year = 2026
  and t.division_code = 'silver'
  and t.code = 'ZJU-USC'
-- 幂等：重复执行不会插第二行，也不会改已有的那行。
-- (team_id, last_name, first_name) 上有唯一约束，(team_id, utr_profile_id)
-- 上还有一个部分唯一索引。
on conflict do nothing;

-- 核对：应当返回 1 行，且该队人数变成 30。
select
    (select count(*)
       from roster_entries r
       join teams t on t.id = r.team_id
      where t.season_year = 2026
        and t.division_code = 'silver'
        and t.code = 'ZJU-USC') as team_size,
    r.last_name,
    r.first_name,
    r.gender,
    r.match_utr,
    r.dutr_status,
    r.source_note,
    r.rating_class,
    r.utr_profile_id,
    r.is_borrowed_player
from roster_entries r
join teams t on t.id = r.team_id
where t.season_year = 2026
  and t.division_code = 'silver'
  and t.code = 'ZJU-USC'
  and r.first_name = 'Qingyang';
