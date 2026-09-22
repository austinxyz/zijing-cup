-- Daily UTR samples (参赛 UTR 采样): one row per (season, player, day) holding
-- the player's current doubles UTR + status as snapshotted that day. The
-- participation UTR is the mean of the rated days across the 9/21-9/25 window;
-- this table is the per-day history that average and the monitor page read.
--
-- doubles_utr/doubles_status are nullable (a player may be unrated on a day).
-- Unique (season_year, player_id, sample_date): re-snapshotting a day upserts.
-- FK to players cascades so deleting a player removes their samples.
--
-- search_path so `supabase db push` / `db reset` (run as postgres) place this on
-- zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

create table player_daily_utr (
  id              bigint generated always as identity primary key,
  season_year     bigint not null references zijing_cup.seasons (year),
  player_id       bigint not null references zijing_cup.players (id) on delete cascade,
  sample_date     date not null,
  doubles_utr     numeric,
  doubles_status  text,
  created_at      timestamptz not null default now(),

  unique (season_year, player_id, sample_date)
);

create index player_daily_utr_season_date_idx
  on player_daily_utr (season_year, sample_date);
