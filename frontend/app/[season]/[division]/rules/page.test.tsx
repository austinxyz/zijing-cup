import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDivisionRules, type DivisionRules } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getDivisionRules: vi.fn() };
});

const SILVER_2026: DivisionRules = {
  season: { year: 2026, edition_name: "第十一届" },
  division: {
    code: "silver",
    display_name: "银组",
    scoring_mode: "match_count",
    buffer_per_line: "0.50",
    buffer_total: "0.50",
    partner_gap_max: "3.50",
    mens_doubles_must_be_ordered: true,
  },
  lines: [
    { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
    { code: "D2", kind: "mens_doubles", sort_order: 2, cap: "12.00", points: 1 },
    { code: "D3", kind: "mens_doubles", sort_order: 3, cap: "11.00", points: 1 },
    { code: "MD", kind: "mixed_doubles", sort_order: 4, cap: "10.25", points: 1 },
    { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
  ],
  eligibility_limits: [
    { gender: "M", utr_above: "7.00", max_players: 1, restricted_to_lines: null },
    { gender: "F", utr_above: "5.50", max_players: 1, restricted_to_lines: null },
  ],
};

const SILVER_2025: DivisionRules = {
  ...SILVER_2026,
  season: { year: 2025, edition_name: "第十届" },
  division: {
    ...SILVER_2026.division,
    buffer_per_line: "0.00",
    buffer_total: "0.00",
  },
  lines: SILVER_2026.lines.map((line) =>
    line.code === "MD"
      ? { ...line, cap: "10.50" }
      : line.code === "WD"
        ? { ...line, cap: "9.50" }
        : line,
  ),
};

const GOLD_2026: DivisionRules = {
  season: { year: 2026, edition_name: "第十一届" },
  division: {
    code: "gold",
    display_name: "金组",
    scoring_mode: "points",
    buffer_per_line: "0.30",
    buffer_total: "0.30",
    partner_gap_max: "3.50",
    mens_doubles_must_be_ordered: true,
  },
  lines: [
    { code: "D1", kind: "mens_doubles", sort_order: 1, cap: null, points: 1 },
    { code: "D2", kind: "mens_doubles", sort_order: 2, cap: "15.00", points: 2 },
    { code: "D3", kind: "mens_doubles", sort_order: 3, cap: "13.00", points: 2 },
    { code: "MD", kind: "mixed_doubles", sort_order: 4, cap: null, points: 1 },
    { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "11.00", points: 2 },
  ],
  eligibility_limits: [
    {
      gender: "M",
      utr_above: "9.00",
      max_players: 1,
      restricted_to_lines: ["D1", "MD"],
    },
    { gender: "M", utr_above: "8.00", max_players: 3, restricted_to_lines: null },
    { gender: "F", utr_above: "7.75", max_players: 1, restricted_to_lines: null },
  ],
};

/** Route params are a Promise in the App Router. */
function params(season: string, division: string) {
  return { params: Promise.resolve({ season, division }) };
}

function mockRules(map: Record<string, DivisionRules | null>) {
  vi.mocked(getDivisionRules).mockImplementation(async (year, code) => {
    const found = map[`${year}-${code}`];
    if (found === undefined) throw new Error(`unexpected fetch: ${year}-${code}`);
    return found;
  });
}

afterEach(() => vi.clearAllMocks());

describe("Rules page — silver", () => {
  it("lists every line with its cap", async () => {
    mockRules({ "2026-silver": SILVER_2026, "2025-silver": SILVER_2025 });

    render(await Page(params("2026", "silver")));

    const table = screen.getByRole("table", { name: "各线 UTR Cap" });
    for (const [code, cap] of [
      ["D1", "13.00"],
      ["D2", "12.00"],
      ["D3", "11.00"],
      ["MD", "10.25"],
      ["WD", "9.25"],
    ]) {
      const row = within(table).getByRole("row", { name: new RegExp(code) });
      expect(within(row).getByText(cap)).toBeInTheDocument();
    }
  });

  it("presents the buffer as a shared team budget, not a per-line tolerance", async () => {
    mockRules({ "2026-silver": SILVER_2026, "2025-silver": SILVER_2025 });

    render(await Page(params("2026", "silver")));

    // The single most misreadable rule in the whole system: five lines each
    // 0.2 over is illegal even though no line exceeds 0.5.
    expect(screen.getByText(/共享预算，不是每线容差/)).toBeInTheDocument();
    expect(screen.getByText(/五线超出量之和也不得超过 0.50/)).toBeInTheDocument();
  });

  it("shows the eligibility limits and shared constraints", async () => {
    mockRules({ "2026-silver": SILVER_2026, "2025-silver": SILVER_2025 });

    render(await Page(params("2026", "silver")));

    expect(screen.getByText("男队员 UTR > 7.00")).toBeInTheDocument();
    expect(screen.getByText("≤ 3.50")).toBeInTheDocument();
    expect(screen.getByText(/不得倒序/)).toBeInTheDocument();
  });
});

describe("Rules page — gold", () => {
  it("shows open lines as open, never as a number", async () => {
    mockRules({ "2026-gold": GOLD_2026, "2025-gold": GOLD_2026 });

    render(await Page(params("2026", "gold")));

    const table = screen.getByRole("table", { name: "各线 UTR Cap" });
    for (const code of ["D1", "MD"]) {
      const row = within(table).getByRole("row", { name: new RegExp(code) });
      expect(within(row).getByText("开放线")).toBeInTheDocument();
    }
    const d2 = within(table).getByRole("row", { name: /D2/ });
    expect(within(d2).getByText("15.00")).toBeInTheDocument();
  });

  it("shows per-line points and the points scoring mode", async () => {
    mockRules({ "2026-gold": GOLD_2026, "2025-gold": GOLD_2026 });

    render(await Page(params("2026", "gold")));

    // Stated twice on purpose — once as the table's caption and once in the
    // constraints list — so assert on the definitive one.
    expect(screen.getByText("记分制")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "各线 UTR Cap" });
    const d2 = within(table).getByRole("row", { name: /D2/ });
    expect(within(d2).getByText("2 分")).toBeInTheDocument();
  });

  it("names the lines a restricted player may occupy", async () => {
    mockRules({ "2026-gold": GOLD_2026, "2025-gold": GOLD_2026 });

    render(await Page(params("2026", "gold")));

    expect(screen.getByText(/只能打 D1、MD/)).toBeInTheDocument();
  });
});

describe("Comparison with the previous season", () => {
  it("marks the caps that changed and the ones that did not", async () => {
    mockRules({ "2026-silver": SILVER_2026, "2025-silver": SILVER_2025 });

    render(await Page(params("2026", "silver")));

    const table = screen.getByRole("table", { name: "各线 UTR Cap" });
    expect(
      within(within(table).getByRole("row", { name: /MD/ })).getByText(
        /10\.50\s*→\s*10\.25/,
      ),
    ).toBeInTheDocument();
    expect(
      within(within(table).getByRole("row", { name: /WD/ })).getByText(
        /9\.50\s*→\s*9\.25/,
      ),
    ).toBeInTheDocument();
    for (const code of ["D1", "D2", "D3"]) {
      const row = within(table).getByRole("row", { name: new RegExp(code) });
      expect(within(row).getByText("未变")).toBeInTheDocument();
    }
  });

  it("flags the buffer as newly introduced", async () => {
    mockRules({ "2026-silver": SILVER_2026, "2025-silver": SILVER_2025 });

    render(await Page(params("2026", "silver")));

    expect(screen.getByText("本届新增")).toBeInTheDocument();
  });

  it("renders normally when there is no previous season", async () => {
    // 2025 is the earliest seeded season; asking for 2024 yields nothing and
    // that must not be an error — it is simply the first season on record.
    mockRules({ "2025-silver": SILVER_2025, "2024-silver": null });

    render(await Page(params("2025", "silver")));

    expect(screen.getByRole("table", { name: "各线 UTR Cap" })).toBeInTheDocument();
    expect(screen.queryByText("未变")).not.toBeInTheDocument();
    expect(screen.queryByText(/较 2024/)).not.toBeInTheDocument();
  });
});
