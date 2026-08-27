-- All tables this project owns live in this schema, never in `public` —
-- this Supabase project is shared with an unrelated app that already uses
-- `public`. See backend/app/db.py's SCHEMA constant and search_path setup.
create schema if not exists zijing_cup;
