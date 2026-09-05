-- Display order for saved lineups, per team.
--
-- The list used to order by name. This adds an explicit, editable order so a
-- captain can drag their favourites to the top. NOT NULL with a database
-- default of 0 (an int has no "unknown" state — 0 is a fine initial value), so
-- inserts need not supply it; save_lineup gives new rows max+1.
--
-- Existing rows are backfilled by name (row_number within each team) so the
-- order does not visibly jump when the list switches from name-ordering to
-- sort_order-ordering.
--
-- search_path so `supabase db push` / `db reset` (run as postgres) place this
-- on zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

alter table saved_lineups
  add column sort_order int not null default 0;

update saved_lineups s
set sort_order = r.rn - 1
from (
  select id, row_number() over (partition by team_id order by name) as rn
  from saved_lineups
) r
where r.id = s.id;
