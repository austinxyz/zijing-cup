-- Saved opponent comparisons: a named (team_a + lineup_a  vs  team_b + lineup_b)
-- reference, per (season, division), plus a per-line notes map.
--
-- Stores REFERENCES, not a snapshot — 展开查看 recomputes the comparison from the
-- referenced saved lineups' current state (阵容变了对比跟着变). lineup_a_id /
-- lineup_b_id are plain bigints with NO foreign key on purpose: deleting a saved
-- lineup must leave the comparison standing (shown as "阵容已删"), not cascade it
-- away. team_a_code / team_b_code are the sheet's own team strings (as elsewhere).
--
-- Admin-global (no per-user login): a comparison belongs to a (season, division).
-- Writes (save/line-note/delete) are guarded by the shared-secret admin middleware
-- keyed on HTTP method; the list read is behind the backend secret.

set search_path to zijing_cup, public;

create table saved_comparisons (
    id bigint generated always as identity primary key,

    -- Scoped to a (season, division), matching how teams/rules are scoped.
    season_year integer not null,
    division_code text not null,

    -- Captain-supplied. Bounded so a stray paste cannot fill the column.
    name text not null check (char_length(name) between 1 and 60),

    -- References. Team codes are free strings; lineup ids are plain ints (NO FK).
    team_a_code text not null,
    lineup_a_id bigint not null,
    team_b_code text not null,
    lineup_b_id bigint not null,

    -- {line_code: text}. One editable note per line; read/written whole.
    line_notes jsonb not null default '{}',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- Scoped to a division (which itself references the season); cascade so a
    -- comparison dies with its division, like teams.
    foreign key (season_year, division_code)
        references divisions (season_year, code) on delete cascade,

    -- One comparison per name within a (season, division). Saving an existing
    -- name overwrites, implemented as an update on this constraint.
    unique (season_year, division_code, name)
);

create index saved_comparisons_scope_idx
    on saved_comparisons (season_year, division_code);
