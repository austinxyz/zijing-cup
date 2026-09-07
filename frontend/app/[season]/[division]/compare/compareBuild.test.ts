import { describe, expect, it } from "vitest";

import type { SavedLineup } from "@/lib/api";
import { buildComparison, type CompareSide } from "./compareBuild";

type Named = { last_name: string; first_name: string; gender: string | null };

function byKey(entries: Record<string, Named>): Map<string, Named> {
  return new Map(Object.entries(entries));
}

function lineup(over: Partial<SavedLineup>): SavedLineup {
  return {
    id: 1,
    name: "L",
    sort_order: 0,
    assignment: {},
    utr_snapshot: {},
    status: "valid",
    violations: [],
    utr_diff: {},
    missing: [],
    line_totals: {},
    total: null,
    ...over,
  } as SavedLineup;
}

function side(over: Partial<SavedLineup>, keys: Record<string, Named>): CompareSide {
  return { savedLineup: lineup(over), byKey: byKey(keys) };
}

const NAMES = {
  a1: { last_name: "Chen", first_name: "Yilun", gender: "M" },
  a2: { last_name: "Hu", first_name: "Mitch", gender: "M" },
  b1: { last_name: "Li", first_name: "Ming", gender: "M" },
  b2: { last_name: "Wang", first_name: "Lei", gender: "M" },
};

describe("buildComparison — per line", () => {
  it("pairs both sides with names+gender+line sum and the diff (mine - opp)", () => {
    const a = side(
      { assignment: { D1: ["a1", "a2"] }, line_totals: { D1: { total: "13.96", cap: null, over: "0" } } },
      { a1: NAMES.a1, a2: NAMES.a2 },
    );
    const b = side(
      { assignment: { D1: ["b1", "b2"] }, line_totals: { D1: { total: "13.24", cap: null, over: "0" } } },
      { b1: NAMES.b1, b2: NAMES.b2 },
    );
    const cmp = buildComparison(["D1"], a, b);
    expect(cmp.rows).toHaveLength(1);
    const row = cmp.rows[0];
    expect(row.line).toBe("D1");
    expect(row.a.players).toEqual([
      { name: "Chen Yilun", gender: "M" },
      { name: "Hu Mitch", gender: "M" },
    ]);
    expect(row.a.sum).toBe("13.96");
    expect(row.b.sum).toBe("13.24");
    expect(row.diff).toBe(0.72);
  });

  it("follows the given line order", () => {
    const a = side({ assignment: { D1: [], MD: [] }, line_totals: {} }, {});
    const b = side({ assignment: { D1: [], MD: [] }, line_totals: {} }, {});
    const cmp = buildComparison(["MD", "D1"], a, b);
    expect(cmp.rows.map((r) => r.line)).toEqual(["MD", "D1"]);
  });
});

describe("buildComparison — totals", () => {
  it("returns both totals and their diff when both present", () => {
    const a = side({ total: "63.62" }, {});
    const b = side({ total: "63.05" }, {});
    const cmp = buildComparison([], a, b);
    expect(cmp.totalA).toBe("63.62");
    expect(cmp.totalB).toBe("63.05");
    expect(cmp.totalDiff).toBe(0.57);
  });

  it("null total diff when one side has no total (player_gone)", () => {
    const a = side({ total: "60.00" }, {});
    const b = side({ total: null, status: "player_gone" }, {});
    const cmp = buildComparison([], a, b);
    expect(cmp.totalB).toBeNull();
    expect(cmp.totalDiff).toBeNull();
    expect(cmp.statusB).toBe("player_gone");
  });
});

describe("buildComparison — edges", () => {
  it("no diff for a line when one side lacks that line total", () => {
    const a = side({ assignment: { D1: ["a1", "a2"] }, line_totals: { D1: { total: "13.0", cap: null, over: "0" } } }, { a1: NAMES.a1, a2: NAMES.a2 });
    const b = side({ assignment: {}, line_totals: {} }, {}); // no D1
    const cmp = buildComparison(["D1"], a, b);
    expect(cmp.rows[0].b.players).toEqual([]);
    expect(cmp.rows[0].b.sum).toBeNull();
    expect(cmp.rows[0].diff).toBeNull();
  });

  it("placeholder name when a key is missing from the roster", () => {
    const a = side({ assignment: { D1: ["ghost", "a1"] }, line_totals: { D1: { total: "6.0", cap: null, over: "0" } } }, { a1: NAMES.a1 });
    const b = side({ assignment: { D1: [] }, line_totals: {} }, {});
    const cmp = buildComparison(["D1"], a, b);
    expect(cmp.rows[0].a.players[0]).toEqual({ name: "（缺）", gender: null });
    expect(cmp.rows[0].a.players[1]).toEqual({ name: "Chen Yilun", gender: "M" });
  });
});
