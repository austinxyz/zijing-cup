import { describe, expect, it } from "vitest";

import type { RosterPlayer, TeamRoster } from "@/lib/api";
import { capsFor, borrowedCountWith, rosterOverCap } from "./teamEdit";

const LIMITS: TeamRoster["borrowed_limits"] = {
  "1": { roster_cap: 3, on_court_cap: 2 },
  "2": { roster_cap: 2, on_court_cap: 1 },
  "3": { roster_cap: 0, on_court_cap: 0 },
};

function player(id: number, borrowed: boolean | null): RosterPlayer {
  return {
    player_id: id, last_name: "南", first_name: `p${id}`, gender: "M",
    match_utr: "6.0", origin: "frozen", origin_year: 2026, is_unresolved: false,
    under_appeal: false, dutr_status: null, rating_class: null, source_note: null,
    daily_utrs: [], singles_utr: null, singles_status: null, doubles_utr: null,
    doubles_status: null, is_borrowed_player: borrowed, is_wildcard: null,
    representing_school: null, utr_profile_id: null,
  };
}

describe("capsFor", () => {
  it("returns the caps for a school count", () => {
    expect(capsFor(LIMITS, 2)).toEqual({ roster_cap: 2, on_court_cap: 1 });
  });
  it("is null when school_count is unset", () => {
    expect(capsFor(LIMITS, null)).toBeNull();
  });
  it("is null when no rule row for that count", () => {
    expect(capsFor(LIMITS, 9)).toBeNull();
  });
});

describe("borrowedCountWith (pending flag overrides applied)", () => {
  const players = [player(1, true), player(2, null), player(3, false)];
  it("counts only confirmed-borrowed from the roster", () => {
    expect(borrowedCountWith(players, {})).toBe(1);
  });
  it("applies a pending mark and unmark", () => {
    // mark p2 borrowed, unmark p1 → count = 1 (p2)
    expect(borrowedCountWith(players, { 1: false, 2: true })).toBe(1);
  });
});

describe("rosterOverCap", () => {
  it("true when borrowed exceeds roster_cap", () => {
    expect(rosterOverCap(3, { roster_cap: 2, on_court_cap: 1 })).toBe(true);
  });
  it("false at or under cap, and false when caps unknown", () => {
    expect(rosterOverCap(2, { roster_cap: 2, on_court_cap: 1 })).toBe(false);
    expect(rosterOverCap(5, null)).toBe(false);
  });
});
