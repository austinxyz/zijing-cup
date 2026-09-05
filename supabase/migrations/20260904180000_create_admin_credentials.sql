-- Per-competition admin password credentials.
--
-- One password per (season, division): a captain gets the password for their
-- own competition and can edit only that; the owner's super password (the
-- existing ADMIN_PASSWORD_HASH env) still edits everything. password_hash is an
-- opaque scrypt `salt:hash` produced and verified only on the Next side — the
-- backend stores and returns the string and never computes or checks a
-- password.
--
-- No FK to seasons/divisions on purpose: the owner may set a competition's
-- password before its division rows exist; the application keys on
-- (season_year, division_code) either way.
--
-- search_path so `supabase db push` / `db reset` (run as postgres) place this on
-- zijing_cup, not the app-shared public.
set search_path to zijing_cup, public;

create table admin_credentials (
  id            bigint generated always as identity primary key,
  season_year   int  not null,
  division_code text not null,
  password_hash text not null,
  updated_at    timestamptz not null default now(),
  unique (season_year, division_code)
);
