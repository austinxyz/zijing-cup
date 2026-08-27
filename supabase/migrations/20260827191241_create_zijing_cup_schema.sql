-- All tables this project owns live in this schema, never in `public` —
-- this Supabase project is shared with an unrelated app that already uses
-- `public`. See backend/app/db.py's SCHEMA constant and search_path setup.
create schema if not exists zijing_cup;

-- Convention for every migration after this one: start with
--   set search_path to zijing_cup, public;
-- (or fully qualify every object as zijing_cup.<name>) — this migration's
-- own DDL runs as the `postgres` role, whose default search_path does NOT
-- include zijing_cup, so unqualified `create table ...` would silently land
-- in `public`, the other app's schema.
