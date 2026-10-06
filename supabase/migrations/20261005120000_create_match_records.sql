-- Match records: a played tie for one (season, division) — our team vs an
-- opponent team in the SAME division, the on-court players for both sides per
-- line, and each line's win/loss + a free-text note.
--
-- `lines` is a JSONB map {line_code: {our:[keys], opp:[pid|null], outcome, note}}:
--   our  = our roster keys ("p{id}", same as saved_lineups.assignment)
--   opp  = opponent player ids (int) or null where unmatched (null = not recorded)
--   outcome = 'win' | 'loss'; note = free text (validated in the write layer).
-- The whole-tie result is DERIVED at read time by the division's scoring_mode;
-- it is deliberately NOT a stored column (no second source of truth).
--
-- our_lineup is an INDEPENDENT snapshot, not a FK to a saved lineup.
-- source_lineup_id is a plain bigint with NO foreign key on purpose: it records
-- which saved lineup was prefilled from, but deleting that lineup must leave this
-- record standing (same reasoning as saved_comparisons.lineup_a_id).
--
-- match_date is admin-entered (a plain DATE), so there is no server-clock / tz
-- ambiguity. Admin-global (no per-user login): writes are guarded by the
-- shared-secret admin middleware keyed on HTTP method; reads sit behind the
-- backend secret.

set search_path to zijing_cup, public;

create table match_records (
    id bigint generated always as identity primary key,

    -- Scoped to a (season, division), matching how teams/rules are scoped.
    season_year integer not null,
    division_code text not null,

    -- Both teams belong to this same (season, division); the write layer enforces
    -- same-division and that they differ. FKs guarantee the rows exist.
    our_team_id bigint not null references teams (id) on delete cascade,
    opponent_team_id bigint not null references teams (id) on delete cascade,

    -- Admin-entered tie date (not a server clock); plain DATE, no tz ambiguity.
    match_date date not null,

    -- Optional free-text round label. Bounded so a stray paste cannot fill it
    -- (the write layer enforces the same 60-char cap; this is defense in depth).
    round_label text check (round_label is null or char_length(round_label) <= 60),

    -- Provenance only: which saved lineup was prefilled from. Plain int, NO FK.
    source_lineup_id bigint,

    -- {line_code: {our:[keys], opp:[pid|null], outcome, note}}. Read/written whole.
    lines jsonb not null default '{}',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- A team cannot play itself.
    check (our_team_id <> opponent_team_id),

    -- Scoped to a division (which itself references the season); cascade so a
    -- record dies with its division, like teams.
    foreign key (season_year, division_code)
        references divisions (season_year, code) on delete cascade
);

create index match_records_scope_idx
    on match_records (season_year, division_code);

create index match_records_opponent_idx
    on match_records (season_year, division_code, opponent_team_id);
