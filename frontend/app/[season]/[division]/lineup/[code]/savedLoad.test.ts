import { describe, expect, it } from "vitest";

import type { LineupCandidate, LineupPlayer, SavedLineup } from "@/lib/api";
import {
  buildSavedLoadHref,
  candidateAssignment,
  savedStaleRefs,
} from "./savedLoad";

function player(key: string): LineupPlayer {
  return {
    key,
    last_name: key,
    first_name: "x",
    gender: "M",
    match_utr: "6.00",
    origin: "frozen",
    origin_year: null,
    is_unresolved: false,
  };
}

const ROSTER: LineupPlayer[] = ["p1", "p2", "p3", "p4", "p5", "p6"].map(player);

function saved(assignment: Record<string, string[]>): SavedLineup {
  return {
    id: 1,
    name: "x",
    assignment,
    utr_snapshot: {},
    status: "valid",
    violations: [],
    utr_diff: {},
    missing: [],
  };
}

describe("candidateAssignment", () => {
  it("maps each line to its two player keys", () => {
    const candidate = {
      total: "50",
      buffer_spent: "0",
      line_totals: {},
      lines: {
        D1: [player("p1"), player("p2")],
        MD: [player("p5"), player("p6")],
      },
    } as unknown as LineupCandidate;
    expect(candidateAssignment(candidate)).toEqual({
      D1: ["p1", "p2"],
      MD: ["p5", "p6"],
    });
  });
});

describe("savedStaleRefs", () => {
  it("is empty when every named key is on the roster", () => {
    expect(savedStaleRefs(saved({ D1: ["p1", "p2"] }), ROSTER)).toEqual([]);
  });

  it("names each seat whose player has left the roster", () => {
    const refs = savedStaleRefs(
      saved({ D1: ["p1", "gone"], MD: ["p9", "p2"] }),
      ROSTER,
    );
    expect(refs).toEqual([
      { line: "D1", key: "gone" },
      { line: "MD", key: "p9" },
    ]);
  });
});

describe("buildSavedLoadHref", () => {
  it("locks all five lines into the search URL", () => {
    const href = buildSavedLoadHref(
      "/2026/silver/lineup/ZJU-USC",
      saved({
        D1: ["p1", "p2"],
        D2: ["p3", "p4"],
        MD: ["p5", "p6"],
      }),
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("D1a")).toBe("p1");
    expect(params.get("D1b")).toBe("p2");
    expect(params.get("D2a")).toBe("p3");
    expect(params.get("MDb")).toBe("p6");
  });
});
