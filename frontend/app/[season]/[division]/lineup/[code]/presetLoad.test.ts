import { describe, expect, it } from "vitest";

import type { LineupFilterPreset, LineupPlayer } from "@/lib/api";
import { buildLoadHref, presetSize, staleLockRefs } from "./presetLoad";

function player(key: string): LineupPlayer {
  return {
    key, last_name: "南", first_name: key, gender: "M",
    match_utr: "6.00", origin: "frozen", origin_year: 2025, is_unresolved: false,
  };
}

const ROSTER = ["p1", "p2", "p3", "p4"].map(player);

function preset(over: Partial<LineupFilterPreset> = {}): LineupFilterPreset {
  return {
    id: 1, name: "主力",
    constraints: { locks: { D1: ["p1", "p2"] }, excluded: ["p3"] },
    ...over,
  };
}

describe("buildLoadHref (loading a preset is a draft, not a search)", () => {
  it("writes the lock/exclude params but NO go — loading must not auto-search", () => {
    const href = buildLoadHref("/2026/silver/lineup/PKU", preset(), ROSTER);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("D1a")).toBe("p1");
    expect(params.get("D1b")).toBe("p2");
    expect(params.getAll("ex")).toContain("p3");
    // The gate: without go the page renders a draft and runs no candidate solve.
    expect(params.get("go")).toBeNull();
  });

  it("drops an excluded player who has left the roster", () => {
    const href = buildLoadHref(
      "/2026/silver/lineup/PKU",
      preset({ constraints: { locks: {}, excluded: ["p9"] } }),
      ROSTER,
    );
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.getAll("ex")).not.toContain("p9");
  });
});

describe("presetSize / staleLockRefs (unchanged helpers)", () => {
  it("counts locks and exclusions", () => {
    expect(presetSize(preset())).toEqual({ locks: 1, excluded: 1 });
  });

  it("names a locked player who has left the roster", () => {
    const refs = staleLockRefs(
      preset({ constraints: { locks: { D1: ["p1", "p9"] }, excluded: [] } }),
      ROSTER,
    );
    expect(refs).toEqual([{ line: "D1", key: "p9" }]);
  });
});
