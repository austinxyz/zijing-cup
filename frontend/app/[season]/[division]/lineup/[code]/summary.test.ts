import { describe, expect, it } from "vitest";

import type { LineupPlayer } from "@/lib/api";
import { constraintSummary } from "./summary";

function player(key: string, last: string, first: string): LineupPlayer {
  return {
    key,
    last_name: last,
    first_name: first,
    gender: "M",
    match_utr: "6.50",
    origin: "frozen",
    origin_year: 2025,
    is_unresolved: false,
  };
}

const ROSTER = [
  player("k1", "陈", "嘉禾"),
  player("k2", "吴", "普强"),
  player("k3", "高", "铭"),
];

describe("constraintSummary", () => {
  it("names the players in a locked pair, not just a count", () => {
    const text = constraintSummary({ D1: ["k1", "k2"] }, [], ROSTER);
    expect(text).toContain("陈 嘉禾");
    expect(text).toContain("吴 普强");
  });

  it("names an excluded player", () => {
    const text = constraintSummary({}, ["k3"], ROSTER);
    expect(text).toContain("高 铭");
    expect(text).toMatch(/排除/);
  });

  it("says so in words when there is no constraint", () => {
    // A blank line and "constrained but silent" cannot be told apart, so the
    // empty case is stated rather than left empty.
    expect(constraintSummary({}, [], ROSTER)).toBe("没有锁定或排除");
  });
});
