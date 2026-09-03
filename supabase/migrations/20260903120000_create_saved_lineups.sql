-- Saved lineups: a chosen 10-player lineup (line assignment) plus a snapshot of
-- each player's participation UTR at save time.
--
-- The snapshot is read-only history: it is NEVER written back to a player's
-- participation UTR and does NOT affect what the engine reads. Legality is
-- always re-judged against the CURRENT participation UTR; the snapshot only
-- powers the "was X, now Y" diff on the saved-lineups page.
--
-- Admin-global, like lineup_filter_presets: there is no per-user login, so a
-- saved lineup belongs to a team. Writes (save/save-back/delete) are guarded by
-- the shared-secret admin middleware (keyed on HTTP method); the list+revalidate
-- read is open.

set search_path to zijing_cup, public;

create table saved_lineups (
    id bigint generated always as identity primary key,

    team_id bigint not null references teams (id) on delete cascade,

    name text not null check (char_length(name) between 1 and 60),

    -- Which two players stand on each line:
    --   {"D1": ["p12","p34"], "D2": [...], ...}
    assignment jsonb not null,

    -- Each player's participation UTR at save time (read-only history):
    --   {"p12": "6.98", "p34": "5.60", ...}
    utr_snapshot jsonb not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (team_id, name)
);

create index saved_lineups_team_idx on saved_lineups (team_id);
