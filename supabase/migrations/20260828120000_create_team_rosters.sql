-- Teams and roster entries, keyed by (season, division).
--
-- A roster entry is a SNAPSHOT: this player, on this team, in this season and
-- division. There is deliberately no `players` table — the committee sheet
-- carries no UTR profile IDs, so cross-season identity cannot be proven from
-- the data (matching by name alone put 23 people in both divisions in 2025).
-- An entity would force a name-based merge and freeze a guess into a foreign
-- key. See openspec design D1.
--
-- Field ownership matters here (design D1b): most columns come from the
-- committee CSV, but three are maintained by hand and the importer must never
-- write them.

set search_path to zijing_cup, public;

create table teams (
    id bigint generated always as identity primary key,

    -- Scoped to a season and division, matching how the rules are scoped.
    season_year integer not null,
    division_code text not null,

    -- The committee sheet's own string: 'ZJU-UCSD-UCB', 'SJTU-SJSU-ECU'.
    -- Stored verbatim — not split into member schools, not normalised, not
    -- alias-merged. The sheet spells the same team differently across tabs,
    -- so any parsing rule here would be deciding on a human's behalf.
    code text not null,

    foreign key (season_year, division_code)
        references divisions (season_year, code) on delete cascade,
    unique (season_year, division_code, code)
);

create table roster_entries (
    id bigint generated always as identity primary key,
    team_id bigint not null references teams (id) on delete cascade,

    -- ---- Columns the committee CSV owns -----------------------------------

    -- Split, as the sheet has them. Names carry alias noise ("Xun (Ivan)",
    -- "Sophia J") and are kept as written.
    last_name text not null,
    first_name text not null,

    gender text check (gender is null or gender in ('M', 'F')),

    -- The participation UTR: the frozen value the event actually uses.
    match_utr numeric(5, 2) not null,

    -- The sheet's own status word, complete with any "/ Appeal" suffix.
    -- Kept verbatim because it is evidence, not a parsed enum.
    dutr_status text not null,

    -- The Notes column: where the participation UTR came from ("Zijing Cup
    -- 2024 UTR", "Captain Provided UTR"). This is the only evidence for
    -- classifying an Unrated player and for raising a UTR grievance, so it is
    -- never normalised away.
    source_note text,

    -- The daily values across the sampling window, in column order. Evidence
    -- for how match_utr was derived; read and written whole, never queried by
    -- a single day.
    daily_utrs numeric(5, 2)[],

    -- ---- Columns maintained by hand ---------------------------------------
    -- The importer MUST NOT write any of these. A whole-row rewrite would
    -- silently reset them on every re-import, and re-import runs whenever a
    -- roster changes.

    -- 'verified' | 'committee' | 'self_rated'. The importer fills this only
    -- when DUTR Status determines it (Rated / Projected). For Unrated it
    -- depends on whether the player has USTA match history — absent from the
    -- sheet — so it stays NULL until a human decides.
    rating_class text check (
        rating_class is null
        or rating_class in ('verified', 'committee', 'self_rated')
    ),

    -- Filling this is a human asserting that two rows are the same person.
    -- Empty asserts nothing.
    utr_profile_id text,

    -- Three-state on purpose: NULL means nobody has marked this, which is
    -- NOT the same claim as "confirmed not a borrowed player". The rules cap
    -- borrowed players per team and per match; collapsing the two would let
    -- downstream report a lineup as checked when it was never checked.
    is_borrowed_player boolean,

    unique (team_id, last_name, first_name)
);

-- Scoped to the team, not global: the rules allow one person to play both
-- gold and silver in the same season, so the same profile may legitimately
-- appear twice across divisions.
create unique index roster_entries_team_profile_idx
    on roster_entries (team_id, utr_profile_id)
    where utr_profile_id is not null;

create index teams_season_division_idx on teams (season_year, division_code);

create index roster_entries_team_id_idx on roster_entries (team_id);
