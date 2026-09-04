-- Career win/loss record on players.
--
-- The committee's current-UTR export carries 总场次/胜/负/胜率 columns. Only
-- 胜/负 are stored here; 总场次 = 胜 + 负 and 胜率 = 胜 / (胜 + 负) are derived on
-- display, never persisted (a stored derived value drifts from its inputs).
--
-- Both columns are nullable with NO default: null means "no record has ever
-- been imported", which is deliberately distinct from 0 (a real 0 wins). A
-- default of 0 would erase that distinction and make every never-imported
-- player look like they went 0-0.
--
-- search_path is set so `supabase db push` / `db reset` (run as postgres with
-- its own default path) place these on zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

alter table players
  add column wins int,
  add column losses int;
