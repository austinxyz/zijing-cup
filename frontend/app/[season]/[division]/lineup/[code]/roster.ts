import type { LineupPlayer, TeamRoster } from "@/lib/api";

/**
 * The team roster shaped as the lineup controls expect it, WITHOUT running a
 * candidate solve. `getTeamRoster` already carries each player's derived
 * participation UTR, gender and origin; the only gap is the key form — the
 * search speaks `p<id>` while the roster endpoint gives a bare `player_id`.
 *
 * A player with no derivable participation UTR comes back with `match_utr:
 * null`; here that becomes an empty string, which the display helpers render as
 * blank rather than as a number (never 0 — 0 is a legal UTR).
 */
export function rosterFromTeam(team: TeamRoster): LineupPlayer[] {
  return team.players.map((p) => ({
    key: `p${p.player_id}`,
    last_name: p.last_name,
    first_name: p.first_name,
    gender: p.gender,
    match_utr: p.match_utr ?? "",
    origin: p.origin ?? "",
    origin_year: p.origin_year,
    is_unresolved: p.is_unresolved,
  }));
}
