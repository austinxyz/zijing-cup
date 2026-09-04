import { describe, expect, it } from "vitest";

import type { TeamRoster } from "@/lib/api";
import { rosterFromTeam } from "./roster";

function teamPlayer(over: Partial<TeamRoster["players"][number]> = {}) {
  return {
    player_id: 1,
    last_name: "南",
    first_name: "望舒",
    gender: "M" as string | null,
    match_utr: "6.50" as string | null,
    origin: "frozen" as string | null,
    origin_year: 2025 as number | null,
    is_unresolved: false,
    under_appeal: false,
    dutr_status: null,
    rating_class: null,
    source_note: null,
    daily_utrs: [],
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
    is_borrowed_player: null,
    is_wildcard: null,
    representing_school: null,
    utr_profile_id: null,
    ...over,
  };
}

function team(players: TeamRoster["players"]): TeamRoster {
  return {
    team: { id: 1, code: "PKU", display_name: null, season_year: 2026, division_code: "silver" },
    players,
    locked: false,
    school_count: null,
    borrowed_limits: {},
  };
}

describe("rosterFromTeam", () => {
  it("prefixes the id into the p<id> key the search speaks", () => {
    const [p] = rosterFromTeam(team([teamPlayer({ player_id: 42 })]));
    expect(p.key).toBe("p42");
  });

  it("carries name, gender and UTR straight through", () => {
    const [p] = rosterFromTeam(
      team([teamPlayer({ first_name: "方朔", gender: "F", match_utr: "5.10" })]),
    );
    expect(p.first_name).toBe("方朔");
    expect(p.gender).toBe("F");
    expect(p.match_utr).toBe("5.10");
  });

  it("blanks a null UTR/origin rather than inventing a number", () => {
    // A player on the team with nothing derivable: null must not become 0
    // (a legal UTR) nor read as an estimate.
    const [p] = rosterFromTeam(
      team([teamPlayer({ match_utr: null, origin: null })]),
    );
    expect(p.match_utr).toBe("");
    expect(p.origin).toBe("");
  });
});
