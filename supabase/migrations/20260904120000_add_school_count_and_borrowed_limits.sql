-- Team school count + per-match borrowed-player ceilings.
--
-- The competition caps how many borrowed ("外援") players a combined-school
-- (联队) team may field, and the cap depends on how many schools the team
-- combines. That school count is a human judgement about the team, so it lives
-- on the team as a nullable integer (null = nobody has set it — NOT zero
-- schools; while null the lineup engine does not enforce the borrowed limit).
--
-- The caps themselves are per-division and change year to year, so they are
-- stored as data (one row per division × school_count) rather than hardcoded —
-- the same shape as division_eligibility_limits. The seed files own the values;
-- the engine reads on_court_cap to reject a lineup with too many borrowed
-- players on court, and roster_cap is a data-entry warning only.

set search_path to zijing_cup, public;

alter table teams
    add column school_count int null;

create table division_borrowed_limits (
    id bigint generated always as identity primary key,

    division_id bigint not null references divisions (id) on delete cascade,

    -- How many schools the 联队 team combines (1..4 in the current rules).
    school_count int not null,

    -- Most borrowed players allowed on the roster (data-entry warning only).
    roster_cap int not null,

    -- Most borrowed players allowed on court in one match (the hard rule the
    -- lineup engine enforces).
    on_court_cap int not null,

    unique (division_id, school_count)
);
