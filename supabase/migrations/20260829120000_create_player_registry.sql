-- The player registry: a person across seasons, their participation UTR per
-- season, and which teams they belong to.
--
-- This revisits the decision recorded in 20260828120000_create_team_rosters:
-- there was deliberately no `players` table, because the committee sheet
-- carries no UTR profile IDs and cross-season identity cannot be proven from
-- the data. That reasoning still holds — matching by name IS a guess. What
-- changes is that the guess is now editable: an admin can merge two rows that
-- turned out to be one person, or split one that turned out to be two.
--
-- `roster_entries` is NOT touched by this migration and NOT read by these
-- tables. Nothing points at the old snapshot and nothing in it points here.
-- That isolation is what makes the rollback plan work: drop these three
-- tables and the system is exactly where it was.

set search_path to zijing_cup, public;

-- A person. Exists independently of any team — a captain can record someone
-- they found on the UTR site before deciding which team they play for.
create table players (
    id bigint generated always as identity primary key,

    last_name text not null,
    first_name text not null,

    -- Nullable on purpose, same as roster_entries.gender: the sheet leaves it
    -- blank sometimes, and inventing a side would invent a player there.
    gender text check (gender is null or gender in ('M', 'F')),

    -- The two live UTRs and each one's own status. These are UTR's own rating
    -- states and have NOTHING to do with the participation-UTR statuses on
    -- player_season_utrs below: 'captain' (队长评定) is a committee judgement
    -- with no counterpart on the UTR site, so the two vocabularies are
    -- separate constraints, not one shared enum.
    singles_utr numeric(5, 2),
    singles_status text check (
        singles_status is null
        or singles_status in ('unrated', 'projected', 'rated')
    ),
    doubles_utr numeric(5, 2),
    doubles_status text check (
        doubles_status is null
        or doubles_status in ('unrated', 'projected', 'rated')
    ),

    -- The only evidence that two records are the same human. Today not a
    -- single roster row has one (0 of 459), which is exactly why identity
    -- starts as a name-based guess; filling these is what makes a future
    -- merge verifiable rather than another guess.
    utr_profile_id text
);

-- Two people can share a name — that is the whole reason merge and split
-- exist — so the profile link is unique where present and the name is not
-- unique at all.
create unique index players_profile_idx
    on players (utr_profile_id)
    where utr_profile_id is not null;

create index players_name_idx on players (lower(last_name), lower(first_name));


-- The participation UTR: one row per (player, season). Frozen before the
-- event and the only number a lineup is checked against.
create table player_season_utrs (
    id bigint generated always as identity primary key,
    player_id bigint not null references players (id) on delete cascade,
    season_year integer not null references seasons (year) on delete cascade,

    -- The value that gets read. When a conflict is unresolved this holds the
    -- LARGER of the two candidates: participation UTR is used almost entirely
    -- as an upper bound (a line cap is "the pair's sum <= cap"), so guessing
    -- low would present an illegal lineup as legal and only show up on match
    -- day, while guessing high merely withholds a few legal options.
    value numeric(5, 2) not null,

    -- The other candidate, kept rather than discarded. Null when there is no
    -- conflict. Two rows would have been the obvious alternative and is the
    -- one thing this design refuses: it would break the (player, season)
    -- uniqueness that everything downstream leans on, and push the choice of
    -- "which row did you mean" onto every reader.
    alt_value numeric(5, 2),

    is_unresolved boolean not null default false,

    -- How the committee decided this value. NOT the same vocabulary as the
    -- current-UTR statuses on players.
    --
    -- Nullable, and that null is a state rather than missing data: 33 of the
    -- 459 rows in the 2025 sheet are Unrated with no rating class, and whether
    -- such a player is committee-adjudicated or captain-rated depends on USTA
    -- match history the sheet does not carry. The same reasoning already keeps
    -- roster_entries.rating_class nullable and makes the roster page say 待定
    -- instead of 自评 — deciding here would settle who counts against the
    -- "at most two captain-rated on court" cap on a human's behalf.
    status text check (
        status is null or status in ('verified', 'committee', 'captain')
    ),

    -- Appeal rides on top of a status instead of replacing it: the 2025 sheet
    -- contains Rated / Appeal, Projected / Appeal AND Unrated / Appeal, so a
    -- fourth status could not represent the data.
    under_appeal boolean not null default false,

    -- Where the number came from. Without this a value prefilled from the
    -- player's current UTR — a guess — is indistinguishable from a frozen
    -- official one, and the cap arithmetic would treat the guess as authority.
    source text not null check (
        source in ('prefilled', 'committee_sheet', 'admin_ruling')
    ),

    -- A conflict is exactly "two different numbers": if there is an alternate
    -- value it must differ from the main one, and an unresolved row must have
    -- something to be unresolved between.
    constraint season_utr_conflict_shape check (
        (alt_value is null and is_unresolved = false)
        or (alt_value is not null and alt_value <> value)
    ),

    unique (player_id, season_year)
);

create index player_season_utrs_unresolved_idx
    on player_season_utrs (season_year)
    where is_unresolved;


-- Which teams a player belongs to. Many rows per player on purpose: the rules
-- allow one person to play gold and silver in the same season, and 82 of the
-- 83 repeated names in the 2025 data are exactly that.
create table player_team_memberships (
    id bigint generated always as identity primary key,
    player_id bigint not null references players (id) on delete cascade,
    team_id bigint not null references teams (id) on delete cascade,

    -- Free text, deliberately not a foreign key to a schools table. Team codes
    -- are hand-written composites ('ZJU-USC', 'SJTU-SJSU-ECU') that the sheet
    -- spells differently across tabs; a lookup table would inherit that alias
    -- problem and force someone to decide the merges on a human's behalf.
    representing_school text,

    -- Capped per team and per match by the rules — but the per-match ceiling
    -- depends on how many schools a team combines, which this system does not
    -- know, so nothing here is validated against it. This column records; it
    -- never decides.
    is_borrowed_player boolean,

    -- A different thing from borrowed, despite sounding close: it means the
    -- player is not from the current school and needs committee approval, and
    -- it does NOT affect eligibility. Recorded, never checked.
    is_wildcard boolean,

    unique (player_id, team_id)
);

create index player_team_memberships_team_idx on player_team_memberships (team_id);


-- Locking a season freezes it: after the matches are played, editing the
-- numbers they were played under would be rewriting history. Locked per
-- season rather than per (season, division) — the two divisions belong to one
-- event.
create table season_locks (
    season_year integer primary key references seasons (year) on delete cascade,
    locked_at timestamptz not null default now(),
    note text
);
