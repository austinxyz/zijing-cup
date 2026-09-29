import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LineupPlayer, SavedLineup } from "@/lib/api";
import { buildSidePreview, lineupSignature } from "./sidePreview";
import { SideLineupPreview } from "./SideLineupPreview";

const LINES = ["D1", "MD"];

function roster(): LineupPlayer[] {
  const base = {
    origin: "frozen", origin_year: 2026, is_unresolved: false,
  };
  return [
    { key: "p1", player_id: 1, last_name: "陈", first_name: "嘉禾", gender: "M", match_utr: "7.10", ...base },
    { key: "p2", player_id: 2, last_name: "吴", first_name: "普强", gender: "M", match_utr: "6.98", ...base },
    { key: "p3", player_id: 3, last_name: "刘", first_name: "洋", gender: "M", match_utr: "6.30", ...base },
    { key: "p4", player_id: 4, last_name: "王", first_name: "芳", gender: "F", match_utr: "5.10", ...base },
  ];
}

function lineup(): SavedLineup {
  return {
    id: 1, name: "主力", sort_order: 0,
    assignment: { D1: ["p1", "p2"], MD: ["p3", "p4"] },
    utr_snapshot: {}, status: "valid", violations: [], utr_diff: {}, missing: [],
    line_totals: { D1: { total: "14.08", cap: null, over: "0" }, MD: { total: "11.40", cap: null, over: "0" } },
    total: "25.48",
  };
}

describe("buildSidePreview", () => {
  it("resolves assignment into per-line seats with name/gender/utr in line order", () => {
    const lines = buildSidePreview(lineup(), roster(), LINES);
    expect(lines.map((l) => l.line)).toEqual(["D1", "MD"]);
    expect(lines[0].players.map((p) => p.name)).toEqual(["陈 嘉禾", "吴 普强"]);
    expect(lines[0].players[0].utr).toBe("7.10");
    expect(lines[1].players[1].gender).toBe("F");
    expect(lines[0].sum).toBe("14.08");
  });

  it("signature names the first line's players", () => {
    expect(lineupSignature(lineup(), roster(), LINES)).toContain("D1 陈 嘉禾·吴 普强");
  });
});

describe("SideLineupPreview", () => {
  it("renders each line's on-court players with gender token and participation UTR", () => {
    render(<SideLineupPreview lines={buildSidePreview(lineup(), roster(), LINES)} />);
    const d1 = screen.getByRole("row", { name: /D1/ });
    expect(within(d1).getByText("陈 嘉禾")).toBeTruthy();
    expect(within(d1).getByText("7.10")).toBeTruthy();
    // gender symbol carries the male token
    const male = within(d1).getAllByText("♂")[0];
    expect(male.className).toMatch(/text-male/);
    // the female seat on MD carries the female token
    const md = screen.getByRole("row", { name: /MD/ });
    expect(within(md).getByText("♀").className).toMatch(/text-female/);
  });
});
