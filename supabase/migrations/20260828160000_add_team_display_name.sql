-- An optional, hand-maintained Chinese name for a team.
--
-- Teams are identified by the committee sheet's code (`PKU`, `USTC-CMU-HQU`).
-- Codes are what everyone actually uses, so they stay the identity and the
-- primary label; this column only adds a friendlier second line where one
-- exists. Most joint sides have no natural Chinese name — a three-school team
-- spelled 中科大·CMU·华侨 reads worse than its code — so the column is
-- nullable and expected to be sparse.
--
-- No default. "" and NULL would otherwise both mean "unnamed", and the roster
-- importer's field-ownership check could not tell a team nobody has named
-- from one whose name it had just wiped.
--
-- This column is NOT owned by the roster CSV: the roster importer must never
-- write or clear it. See `SOURCE_FIELDS` in app/rosters/load.py.

set search_path to zijing_cup, public;

alter table teams
  add column display_name text;
