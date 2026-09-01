import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notFound } from "next/navigation";
import {
  getDivisionRules,
  getTeamLineups,
  type DivisionRules,
  type LineupPlayer,
  type LineupSearch,
} from "@/lib/api";
import Page, { hasStaleKeys } from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getTeamLineups: vi.fn(),
    getDivisionRules: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const RULES: DivisionRules = {
  season: { year: 2026, edition_name: null },
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
  eligibility_limits: [],
};

function player(key: string, first: string, gender: string, utr: string): LineupPlayer {
  return {
    key,
    last_name: "南",
    first_name: first,
    gender,
    match_utr: utr,
    origin: "frozen",
    origin_year: 2026,
    is_unresolved: false,
  };
}

const ROSTER = [
  player("p1", "嘉禾", "M", "6.80"),
  player("p2", "鹏远", "M", "6.41"),
  player("p3", "明轩", "M", "6.00"),
  player("p4", "一鸣", "M", "5.93"),
  player("p5", "普强", "M", "5.60"),
  player("p6", "秦朗", "M", "5.40"),
  player("p7", "冠宇", "M", "5.20"),
  player("p8", "雨萌", "F", "4.90"),
  player("p9", "佳怡", "F", "4.63"),
  player("p10", "可欣", "F", "4.35"),
];

function candidate(total: string, buffer: string): LineupSearch["candidates"][number] {
  return {
    total,
    buffer_spent: buffer,
    lines: {
      D1: [ROSTER[0], ROSTER[1]],
      D2: [ROSTER[2], ROSTER[3]],
      D3: [ROSTER[4], ROSTER[5]],
      MD: [ROSTER[6], ROSTER[7]],
      WD: [ROSTER[8], ROSTER[9]],
    },
    line_totals: {
      D1: { total: "13.21", cap: "13.00", over: "0.21" },
      D2: { total: "11.93", cap: "12.00", over: "0" },
      D3: { total: "11.00", cap: "11.00", over: "0" },
      MD: { total: "10.10", cap: "10.25", over: "0" },
      WD: { total: "8.98", cap: "9.25", over: "0" },
    },
  };
}

const SEARCH: LineupSearch = {
  candidates: [candidate("55.92", "0.21"), candidate("55.90", "0.18")],
  ceiling: "55.92",
  squads_at_ceiling: 1,
  squads_at_ceiling_exact: true,
  rules_ceiling: "56.00",
  infeasible_line: null,
  placements: {},
  truncated: false,
  borrowed_players_checked: false,
  invalid_locks: [],
  roster: ROSTER,
  missing_utr_count: 0,
  estimated_count: 0,
  unresolved_count: 0,
};

function renderPage(query: Record<string, string | string[]> = {}) {
  return Page({
    params: Promise.resolve({
      season: "2026",
      division: "silver",
      code: "PKU",
    }),
    searchParams: Promise.resolve(query),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("the lineup page reads its locks and exclusions from the URL", () => {
  it("passes the locked pairs and excluded players in the URL to the search", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage({ D1a: "p1", D1b: "p2", ex: ["p9"] }));

    expect(getTeamLineups).toHaveBeenCalledWith(
      "2026",
      "silver",
      "PKU",
      expect.objectContaining({
        locks: { D1: ["p1", "p2"] },
        excluded: ["p9"],
      }),
    );
  });

  it("shows the URL's locks selected in the controls, so the link reproduces them", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage({ D1a: "p1", D1b: "p2", ex: ["p9"] }));

    // The control is a plain GET form: what it shows comes from the query
    // string, so opening the same URL again yields the same locks. Held in
    // React state instead, it would disagree with the address bar the moment
    // the link was shared or the page reloaded.
    const first = screen.getByLabelText("D1 第一位") as HTMLSelectElement;
    const second = screen.getByLabelText("D1 第二位") as HTMLSelectElement;
    expect(first.value).toBe("p1");
    expect(second.value).toBe("p2");

    const excluded = screen.getByLabelText(/佳怡/) as HTMLInputElement;
    expect(excluded.checked).toBe(true);
  });

  it("submits its constraints through the address bar, not to an action", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage());

    const form = screen.getByRole("search");
    expect(form.getAttribute("method")).toBe("get");
    expect(within(form).getByRole("button", { name: "搜索阵容" })).toBeTruthy();
    // An unlocked line reads as unlocked rather than as a chosen player.
    expect(within(form).getAllByText("交给引擎").length).toBeGreaterThan(0);
    expect(within(form).getByText("本场不能上")).toBeTruthy();
  });

  it("is a 404 for a team that does not exist", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});

describe("the result area leads with the ceilings, then the candidates", () => {
  it("shows the reachable ceiling, what the rules allow, the gap and the squad count", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage());

    const summary = screen.getByRole("region", { name: "上限" });
    expect(within(summary).getByText("本队可达上限")).toBeTruthy();
    expect(within(summary).getByText("55.92")).toBeTruthy();
    expect(within(summary).getByText("规则允许")).toBeTruthy();
    expect(within(summary).getByText("56.00")).toBeTruthy();
    // The gap is the thing a captain acts on, and it is not something the
    // page can leave the reader to subtract.
    expect(within(summary).getByText("差 0.08")).toBeTruthy();
    expect(within(summary).getByText(/只有 1 组/)).toBeTruthy();
  });

  it("shows every line of a candidate with both players, their gender and the line total", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage());

    const table = screen.getByRole("table");
    // Line codes are column headers now, shared across rows.
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim());
    for (const line of ["D1", "D2", "D3", "MD", "WD"]) {
      expect(heads).toContain(line);
    }
    const first = within(table).getAllByRole("row")[1]; // first candidate
    expect(within(first).getByText(/南 嘉禾/)).toBeTruthy();
    // Gender is required: the high-UTR limits are written per gender.
    expect(within(first).getAllByText("男").length).toBeGreaterThan(0);
    expect(within(first).getAllByText("女").length).toBeGreaterThan(0);
    expect(within(first).getByText("13.21")).toBeTruthy();
    // Only the line that is over says so, and by how much.
    expect(within(first).getByText(/超 0\.21/)).toBeTruthy();
    // buffer is a column; the cell shows spent/total without the word.
    expect(within(first).getByText("0.21/0.50")).toBeTruthy();
  });

  it("counts the candidates it was given, without re-sorting or re-deduplicating", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage());

    // The backend already deduplicated by the ten on court and ordered them.
    // Re-sorting here would break ties differently on every render.
    expect(screen.getByText(/去重后 2 套/)).toBeTruthy();
    const table = screen.getByRole("table");
    const totals = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[1].textContent?.replace(/[^\d.]/g, ""));
    expect(totals).toEqual(["55.92", "55.90"]);
  });
});

describe("what the locks cost", () => {
  it("shows the drop against the unconstrained ceiling when something is locked", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockImplementation(async (_y, _d, _t, constraints) => {
      const locked = Object.keys(constraints?.locks ?? {}).length > 0;
      return { ...SEARCH, ceiling: locked ? "55.71" : "55.92" };
    });

    render(await renderPage({ D1a: "p1", D1b: "p2" }));

    // Without this the number reads as the team's ceiling rather than the
    // ceiling of the question that was actually asked.
    const summary = screen.getByRole("region", { name: "上限" });
    expect(within(summary).getByText(/55\.92 降到 55\.71/)).toBeTruthy();
    expect(within(summary).getByText(/代价/)).toBeTruthy();
  });

  it("runs a second search only when something is actually constrained", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage());

    // A baseline search costs as much as the real one, and with nothing
    // locked it is the same search.
    expect(getTeamLineups).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/锁定是有代价的/),
    ).toBeNull();
  });

  it("says nothing about a cost when the locks did not lower the ceiling", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    render(await renderPage({ D1a: "p1", D1b: "p2" }));

    expect(screen.queryByText(/锁定是有代价的/)).toBeNull();
  });
});

describe("the three states that must never be read off an empty list", () => {
  it("says no legal lineup exists and names the line, instead of an empty list", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue({
      ...SEARCH,
      candidates: [],
      ceiling: null,
      squads_at_ceiling: 0,
      infeasible_line: "WD",
      placements: { p8: "MD", p9: "excluded" },
    });

    render(await renderPage({ ex: ["p9"] }));

    const blocked = screen.getByRole("region", { name: "无解" });
    expect(within(blocked).getByText("凑不出合法阵容")).toBeTruthy();
    expect(within(blocked).getByText(/WD/)).toBeTruthy();
    // "Searched and found nothing" is a different claim, and the page has to
    // rule it out in words rather than by showing zero rows.
    expect(within(blocked).getByText(/这不是「搜索没找到」/)).toBeTruthy();
    // No candidate list at all — an empty one reads as "searched, nothing".
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByText(/去重后 0 套/)).toBeNull();
  });

  it("shows where the unavailable players went, and says that is not blame", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue({
      ...SEARCH,
      candidates: [],
      ceiling: null,
      infeasible_line: "WD",
      placements: { p8: "MD", p9: "excluded" },
    });

    render(await renderPage({ ex: ["p9"] }));

    const blocked = screen.getByRole("region", { name: "无解" });
    expect(within(blocked).getByText(/南 雨萌/)).toBeTruthy();
    expect(within(blocked).getByText("已锁 MD")).toBeTruthy();
    expect(within(blocked).getByText("排除")).toBeTruthy();
    // Without this sentence the list reads as "this lock caused it", which
    // the search never claimed and cannot know.
    expect(
      within(blocked).getByText(/不是逐条拆锁重算|该负责/),
    ).toBeTruthy();
  });

  it("declares a truncated search, and does not declare one that finished", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue({ ...SEARCH, truncated: true });

    const { unmount } = render(await renderPage());
    expect(screen.getByText("搜索被截断")).toBeTruthy();
    unmount();

    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);
    render(await renderPage());
    expect(screen.queryByText("搜索被截断")).toBeNull();
  });

  it("always states that the borrowed-player limit was not checked", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    const { unmount } = render(await renderPage());
    expect(screen.getByText("外援限制未校验")).toBeTruthy();
    unmount();

    // Including when there is nothing to show: silence reads as "checked".
    vi.mocked(getTeamLineups).mockResolvedValue({
      ...SEARCH,
      candidates: [],
      infeasible_line: "WD",
    });
    render(await renderPage());
    expect(screen.getByText("外援限制未校验")).toBeTruthy();
  });

  it("reports a lock the rules forbid instead of showing no candidates", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getTeamLineups).mockResolvedValue({
      ...SEARCH,
      candidates: [],
      ceiling: null,
      invalid_locks: [
        {
          code: "line_cap",
          line: "D3",
          amount: "1.21",
          message: "D3 的参赛 UTR 之和 12.21 超出 cap 11.00 1.21",
        },
      ],
    });

    render(await renderPage({ D3a: "p1", D3b: "p2" }));

    const invalid = screen.getByRole("region", { name: "锁定不合法" });
    expect(within(invalid).getByText(/超出 cap/)).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });
});

describe("an unknown season or division", () => {
  it("is a 404, not a lineup page with no rules in it", async () => {
    vi.mocked(getDivisionRules).mockResolvedValue(null);
    vi.mocked(getTeamLineups).mockResolvedValue(SEARCH);

    // Without the rules there are no caps, and a lineup shown against no
    // caps looks checked when nothing checked it.
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getTeamLineups).not.toHaveBeenCalled();
  });
});

describe("links built before the keys changed shape", () => {
  it("spots a bare-integer lock", () => {
    // Both id spaces are small integers, so a stale key can name a real
    // player who is simply not the one the link meant.
    expect(hasStaleKeys({ locks: { D1: ["12", "13"] }, excluded: [] })).toBe(
      true,
    );
  });

  it("spots a bare-integer exclusion", () => {
    expect(hasStaleKeys({ locks: {}, excluded: ["12"] })).toBe(true);
  });

  it("accepts current keys", () => {
    expect(
      hasStaleKeys({ locks: { D1: ["p12", "p13"] }, excluded: ["p9"] }),
    ).toBe(false);
  });

  it("accepts a request with no constraints at all", () => {
    expect(hasStaleKeys({ locks: {}, excluded: [] })).toBe(false);
  });
});
