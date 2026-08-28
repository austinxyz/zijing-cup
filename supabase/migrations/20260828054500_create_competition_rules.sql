-- Competition rules, keyed by (season, division).
--
-- The Zijing Cup runs once a year in two divisions (gold / silver) whose
-- rules differ AND change between seasons: silver's mixed-doubles cap went
-- 10.5 -> 10.25 between 2025 and 2026, and the UTR buffer did not exist at
-- all before 2026. None of these numbers belong in application code.
--
-- See docs/domain/rules.md for the rule text these tables encode.

-- Required. `supabase db reset` / `db push` run DDL as `postgres`, whose
-- default search_path does NOT include zijing_cup — an unqualified
-- `create table` would land in `public`, which belongs to the unrelated app
-- sharing this Supabase project.
set search_path to zijing_cup, public;

create table seasons (
    year integer primary key,
    -- Free-form because it is display copy, not an identifier: "第十一届".
    edition_name text
);

create table divisions (
    id bigint generated always as identity primary key,
    season_year integer not null references seasons (year) on delete cascade,
    -- URL segment as well as storage key; the display name is separate so
    -- routes stay ASCII while the UI shows 金组 / 银组.
    code text not null check (code in ('gold', 'silver')),
    display_name text not null,

    -- Silver counts line wins. Gold (2026 onward) scores weighted points,
    -- which is why division_lines.points exists.
    scoring_mode text not null check (scoring_mode in ('match_count', 'points')),

    -- Two separate allowances, deliberately not collapsed into one column.
    -- The rules state them as distinct constraints: each line may exceed its
    -- cap by at most buffer_per_line, AND the sum of all overages across the
    -- lineup may not exceed buffer_total. They happen to be equal in 2026
    -- (0.50 silver, 0.30 gold); one column would assert they always are.
    -- 0 for seasons predating the buffer system.
    buffer_per_line numeric(4, 2) not null default 0 check (buffer_per_line >= 0),
    buffer_total numeric(4, 2) not null default 0 check (buffer_total >= 0),

    -- Both divisions, every line: partners' UTRs may differ by at most this.
    partner_gap_max numeric(4, 2) not null check (partner_gap_max > 0),

    -- "三线男双不能田忌赛马" — the men's doubles lines may not be ordered
    -- weakest-first. Stored as a flag only: the rules text gives no numeric
    -- definition of the ordering, so the comparison is deliberately NOT
    -- decided here. See the open question in docs/domain/rules.md.
    mens_doubles_must_be_ordered boolean not null default true,

    unique (season_year, code)
);

create table division_lines (
    id bigint generated always as identity primary key,
    division_id bigint not null references divisions (id) on delete cascade,
    code text not null check (code in ('D1', 'D2', 'D3', 'MD', 'WD')),
    kind text not null check (
        kind in ('mens_doubles', 'womens_doubles', 'mixed_doubles')
    ),

    -- Presentation order and the sequence the no-reordering rule applies to
    -- across the men's doubles lines.
    sort_order integer not null,

    -- NULL means "open line": no UTR ceiling at all (gold's D1 and MD).
    -- This is a different kind of line, not a very large cap, so it must not
    -- be encoded as a big number — and the buffer only ever applies to lines
    -- that have a cap, which falls out of this being NULL.
    cap numeric(5, 2) check (cap is null or cap > 0),

    -- Score weight. Meaningful when the division scores points (gold:
    -- 1/2/2/1/2, total 8); silver stores it too but decides by line wins.
    points integer not null check (points >= 0),

    unique (division_id, code),
    unique (division_id, sort_order)
);

create table division_eligibility_limits (
    id bigint generated always as identity primary key,
    division_id bigint not null references divisions (id) on delete cascade,

    gender text not null check (gender in ('M', 'F')),

    -- "UTR>7.0 的男队员不超过 1 名" — a strict threshold plus a headcount.
    utr_above numeric(5, 2) not null,
    max_players integer not null check (max_players >= 0),

    -- Gold's top rule also confines those players to specific lines
    -- ("只能打第一男双或混双"). NULL means any line, which is what every
    -- silver limit needs. An empty array would mean "no line at all" — a
    -- different and nonsensical statement — so the column stays nullable
    -- rather than defaulting to '{}'.
    restricted_to_lines text[] check (
        restricted_to_lines is null or array_length(restricted_to_lines, 1) > 0
    ),

    unique (division_id, gender, utr_above)
);

-- The only access pattern that is not a primary-key lookup: the API resolves
-- a division from the URL's season and code, then fans out to its lines and
-- limits.
create index division_lines_division_id_idx on division_lines (division_id);

create index division_eligibility_limits_division_id_idx
    on division_eligibility_limits (division_id);
