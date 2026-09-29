import { describe, expect, it } from "vitest";

import type { LineupPlayer, SavedComparison, SavedLineup } from "@/lib/api";
import { buildComparisonView, type ResolvedSide } from "./comparisonView";

const LINES = ["D1"];

function roster(prefix: string): LineupPlayer[] {
  const base = { origin: "frozen", origin_year: 2026, is_unresolved: false };
  return [
    { key: `${prefix}1`, player_id: 1, last_name: "陈", first_name: "一", gender: "M", match_utr: "7.0", ...base },
    { key: `${prefix}2`, player_id: 2, last_name: "吴", first_name: "二", gender: "M", match_utr: "6.5", ...base },
  ];
}
function lineup(prefix: string, total: string): SavedLineup {
  return {
    id: 1, name: "主力", sort_order: 0,
    assignment: { D1: [`${prefix}1`, `${prefix}2`] },
    utr_snapshot: {}, status: "valid", violations: [], utr_diff: {}, missing: [],
    line_totals: { D1: { total, cap: null, over: "0" } }, total,
  };
}
function row(notes: Record<string, string> = {}): SavedComparison {
  return {
    id: 5, name: "预案", team_a_code: "TA", lineup_a_id: 1,
    team_b_code: "TB", lineup_b_id: 2, line_notes: notes,
    created_at: null, updated_at: null,
  };
}

describe("buildComparisonView", () => {
  it("builds line seats, diff, and carries the per-line note when both sides resolve", () => {
    const a: ResolvedSide = { teamCode: "TA", lineup: lineup("a", "13.5"), roster: roster("a") };
    const b: ResolvedSide = { teamCode: "TB", lineup: lineup("b", "13.0"), roster: roster("b") };
    const v = buildComparisonView(row({ D1: "我方稳" }), a, b, LINES);
    expect(v.aDeleted).toBe(false);
    expect(v.lines[0].a?.map((s) => s.name)).toEqual(["陈 一", "吴 二"]);
    expect(v.lines[0].diff).toBeCloseTo(0.5);
    expect(v.lines[0].note).toBe("我方稳");
    expect(v.totalDiff).toBeCloseTo(0.5);
    expect(v.aLabel).toBe("TA 主力");
  });

  it("marks a side deleted (null lineup), keeps the comparison, no diff", () => {
    const a: ResolvedSide = { teamCode: "TA", lineup: lineup("a", "13.5"), roster: roster("a") };
    const b: ResolvedSide = { teamCode: "TB", lineup: null, roster: null };
    const v = buildComparisonView(row(), a, b, LINES);
    expect(v.bDeleted).toBe(true);
    expect(v.bLabel).toBe("TB（阵容已删）");
    expect(v.lines[0].b).toBeNull();
    expect(v.lines[0].a).not.toBeNull();
    expect(v.lines[0].diff).toBeNull();
    expect(v.totalDiff).toBeNull();
  });
});
