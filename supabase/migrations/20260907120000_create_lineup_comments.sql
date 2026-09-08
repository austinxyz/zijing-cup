-- Lineup comments (阵容评论): append-only free-text remarks on a saved lineup —
-- who to use it against, why it is arranged this way, which line to watch. A
-- comment is never edited in place; the record is the sequence of remarks over
-- time. The timeline reads newest-first by created_at.
--
-- Symmetric to player_notes. Attached to a saved_lineup (FK cascade): deleting
-- the lineup removes its comments rather than orphaning them. Cloning a lineup
-- does not copy comments — the clone is a new saved_lineups row and its comment
-- set starts empty (clone copies assignment/snapshot, not this table).
--
-- body length is bounded by CHECK so an over-long value is rejected at the
-- database, not silently stored. created_at defaults to now() (NOT NULL) so the
-- ordering comes from one clock — the database's — not the app's.
--
-- search_path so `supabase db push` / `db reset` (run as postgres) place this on
-- zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

create table lineup_comments (
  id               bigint generated always as identity primary key,
  saved_lineup_id  bigint not null references zijing_cup.saved_lineups (id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now()
);

create index lineup_comments_saved_lineup_id_created_at_idx
  on lineup_comments (saved_lineup_id, created_at desc);
