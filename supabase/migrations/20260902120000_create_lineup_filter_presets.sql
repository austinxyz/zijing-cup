-- Named saved filters (presets) for lineup search: a team's locked pairs and
-- exclusions, stored so a captain can reload them without keeping a link.
--
-- Only INPUT constraints are stored here — never a search result, never a UTR
-- snapshot. Recomputing the lineup from these constraints is the whole point,
-- and freezing a result would be a different feature (lineup-saved-lineups).
--
-- Admin-global: there is no per-user login in this project, so a preset belongs
-- to a team, not a person. Writes (save/delete) are guarded by the shared-secret
-- admin middleware, which keys on HTTP method; reads (list) are open.

set search_path to zijing_cup, public;

create table lineup_filter_presets (
    id bigint generated always as identity primary key,

    -- The owning team. A preset's player keys are that team's roster keys, so a
    -- preset is meaningless outside its team; cascade so it dies with the team.
    team_id bigint not null references teams (id) on delete cascade,

    -- Captain-supplied. Bounded so a stray paste cannot fill the column.
    name text not null check (char_length(name) between 1 and 60),

    -- The input constraints, same shape as the URL query params:
    --   {"locks": {"D1": ["p12","p34"], ...}, "excluded": ["p56", ...]}
    -- A single JSONB column, not normalised child rows: it is read and written
    -- whole (dropped back into the URL), never queried by individual lock.
    constraints jsonb not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- One preset per name within a team. Saving an existing name overwrites,
    -- implemented as an upsert on this constraint.
    unique (team_id, name)
);

create index lineup_filter_presets_team_idx
    on lineup_filter_presets (team_id);
