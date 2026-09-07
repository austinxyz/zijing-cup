-- Player scouting notes (球员评价): append-only observations about a player —
-- strengths, weaknesses, good partners, other. A note is never edited in place;
-- the record is the sequence of observations over time. The timeline reads
-- newest-first by created_at.
--
-- category is constrained to a fixed set by CHECK so a bad value is rejected at
-- the database, not silently stored. created_at defaults to now() (NOT NULL) so
-- the ordering comes from one clock — the database's — not the app's.
--
-- Attached to a player globally (no season/division column): a captain's read of
-- a player carries across the seasons they play. FK cascades so deleting a
-- player removes their notes rather than orphaning them.
--
-- search_path so `supabase db push` / `db reset` (run as postgres) place this on
-- zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

create table player_notes (
  id          bigint generated always as identity primary key,
  player_id   bigint not null references zijing_cup.players (id) on delete cascade,
  category    text not null check (category in ('strength', 'weakness', 'partner', 'other')),
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index player_notes_player_id_created_at_idx
  on player_notes (player_id, created_at desc);
