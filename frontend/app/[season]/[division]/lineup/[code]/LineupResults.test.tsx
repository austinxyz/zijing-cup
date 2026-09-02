import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LineupPlayer, LineupSearch, RuleLine } from "@/lib/api";
import { LineupResults } from "./LineupResults";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 2, cap: "9.25", points: 1 },
];

function person(overrides: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    key: "p1",
    last_name: "南",
    first_name: "望舒",
    gender: "M",
    match_utr: "6.50",
    origin: "frozen",
    origin_year: 2025,
    is_unresolved: false,
    ...overrides,
  };
}

function search(overrides: Partial<LineupSearch> = {}): LineupSearch {
  const a = person({ key: "p1" });
  const b = person({ key: "p2", first_name: "方朔" });
  return {
    candidates: [
      {
        total: "13.00",
        buffer_spent: "0.00",
        lines: { D1: [a, b] },
        line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
      },
    ],
    ceiling: "13.00",
    squads_at_ceiling: 1,
    squads_at_ceiling_exact: true,
    rules_ceiling: "13.50",
    infeasible_line: null,
    infeasibility: null,
    placements: {},
    truncated: false,
    borrowed_players_checked: false,
    invalid_locks: [],
    roster: [a, b],
    missing_utr_count: 0,
    estimated_count: 0,
    unresolved_count: 0,
    ...overrides,
  };
}

function show(overrides: Partial<LineupSearch> = {}) {
  render(
    <LineupResults
      search={search(overrides)}
      lines={LINES}
      bufferTotal="0.50"
      lineOrder={["D1", "WD"]}
    />,
  );
}

describe("players the search could not use", () => {
  it("says how many were left out", () => {
    // The ceiling and every candidate are computed over the rest, so silence
    // would present a partial answer as the whole squad's.
    show({ missing_utr_count: 2 });

    expect(
      screen.getByText("本队 2 人因缺少参赛 UTR 未参与计算"),
    ).toBeTruthy();
  });

  it("stays quiet when nobody was left out", () => {
    show({ missing_utr_count: 0 });

    expect(screen.queryByText(/未参与计算/)).toBeNull();
  });

  it("keeps that notice on the neutral tier", () => {
    // Nothing is wrong: those players simply have no number yet.
    show({ missing_utr_count: 2 });

    const note = screen.getByText("本队 2 人因缺少参赛 UTR 未参与计算");
    expect(note.className).not.toMatch(/warning|danger/);
  });
});

describe("unresolved participation UTRs", () => {
  it("says how many and which way it read them", () => {
    show({ unresolved_count: 3 });

    expect(
      screen.getByText("本结果含 3 名参赛 UTR 未裁决的队员，按较大值计算"),
    ).toBeTruthy();
  });

  it("stays quiet when there are none", () => {
    show({ unresolved_count: 0 });

    expect(screen.queryByText(/未裁决/)).toBeNull();
  });

  it("puts it on the warning tier", () => {
    show({ unresolved_count: 3 });

    const note = screen.getByText(
      "本结果含 3 名参赛 UTR 未裁决的队员，按较大值计算",
    );
    expect(note.className).toMatch(/warning/);
  });
});

describe("estimated numbers inside a lineup", () => {
  it("marks the individual number", () => {
    const derived = person({
      key: "p2",
      first_name: "方朔",
      origin: "prior_season",
      origin_year: 2024,
    });
    show({
      candidates: [
        {
          total: "13.00",
          buffer_spent: "0.00",
          lines: { D1: [person(), derived] },
          line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
        },
      ],
      estimated_count: 1,
    });

    // Dense view marks the number with a compact glyph (title 估算值), not the
    // literal word — see the MODIFIED spec.
    expect(screen.getAllByTitle("估算值").length).toBeGreaterThan(0);
  });

  it("says what the whole lineup rests on", () => {
    // Legality is a property of the set: the line sums, the shared buffer and
    // the high-UTR count all use these numbers, so one estimate makes "this
    // is legal" itself an estimate.
    const derived = person({
      key: "p2",
      first_name: "方朔",
      origin: "current_doubles",
      origin_year: null,
    });
    show({
      candidates: [
        {
          total: "13.00",
          buffer_spent: "0.00",
          lines: { D1: [person(), derived] },
          line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
        },
      ],
      estimated_count: 1,
    });

    // The full wording moves to a reachable place (the set marker's title and
    // the legend), rather than repeating inline on every row.
    expect(
      screen.getAllByTitle("含 1 个估算值，合法性待总表确认").length,
    ).toBeGreaterThan(0);
  });

  it("marks nothing when every number is frozen", () => {
    show();

    expect(screen.queryByText("估算")).toBeNull();
    expect(screen.queryByText(/个估算值/)).toBeNull();
  });

  it("marks the ceiling when an estimate produced it", () => {
    // The single number most likely to be quoted on its own.
    const derived = person({
      key: "p2",
      first_name: "方朔",
      origin: "prior_season",
      origin_year: 2024,
    });
    show({
      candidates: [
        {
          total: "13.00",
          buffer_spent: "0.00",
          lines: { D1: [person(), derived] },
          line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
        },
      ],
      estimated_count: 1,
    });

    expect(screen.getByText("含估算值")).toBeTruthy();
  });
});

function threeCandidates() {
  const a = person({ key: "p1", first_name: "望舒" });
  const b = person({ key: "p2", first_name: "方朔" });
  const mk = (total: string) => ({
    total,
    buffer_spent: "0.00",
    lines: { D1: [a, b] as [LineupPlayer, LineupPlayer] },
    line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
  });
  return [mk("13.00"), mk("12.80"), mk("12.60")];
}

describe("desktop comparison table", () => {
  it("renders candidates as a table with a column per line", () => {
    show();
    const table = screen.getByRole("table");
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent?.trim());
    expect(heads).toContain("总和");
    expect(heads).toContain("D1");
    expect(heads).toContain("WD");
  });

  it("gives one body row per candidate, in the backend order", () => {
    show({ candidates: threeCandidates() });
    const table = screen.getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1); // drop header
    expect(bodyRows).toHaveLength(3);
    // Totals appear top-to-bottom in the order the backend gave them.
    const totals = bodyRows.map((r) => {
      const cells = within(r).getAllByRole("cell");
      return cells[1].textContent?.replace(/[^\d.]/g, ""); // 2nd cell = 总和
    });
    expect(totals).toEqual(["13.00", "12.80", "12.60"]);
  });

  it("exposes the full pair name via title when the cell truncates", () => {
    show();
    const table = screen.getByRole("table");
    const nameCell = within(table).getByText(/望舒/).closest("[title]");
    // Contract D1: a truncated long name must stay recoverable on hover.
    expect(nameCell).not.toBeNull();
    expect(nameCell!.getAttribute("title")).toContain("南 望舒");
    expect(nameCell!.getAttribute("title")).toContain("南 方朔");
  });

  it("keeps player names on a single line (no wrap)", () => {
    show();
    const table = screen.getByRole("table");
    const nameCell = within(table).getByText(/望舒/).closest("div,td");
    expect(nameCell).not.toBeNull();
    // whitespace-nowrap class is how the table keeps names from wrapping.
    expect(nameCell!.className).toMatch(/nowrap|truncate/);
  });
});

describe("mobile candidate rows", () => {
  function rows() {
    return within(screen.getByTestId("candidate-rows"));
  }

  it("renders a compact list, not a second table", () => {
    show({ candidates: threeCandidates() });
    const list = screen.getByTestId("candidate-rows");
    expect(list.querySelector("table")).toBeNull();
  });

  it("shows total and the D1 signature on each row", () => {
    show({ candidates: threeCandidates() });
    // Signature = the D1 pair (南 望舒 · 南 方朔), the marquee line.
    expect(rows().getAllByText(/望舒/).length).toBeGreaterThan(0);
    expect(rows().getAllByText("13.00").length).toBeGreaterThan(0);
  });

  it("flags a row that contains an estimate", () => {
    const derived = person({ key: "p2", first_name: "方朔", origin: "prior_season", origin_year: 2024 });
    show({
      candidates: [{
        total: "13.00", buffer_spent: "0.00",
        lines: { D1: [person(), derived] },
        line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
      }],
      estimated_count: 1,
    });
    expect(rows().getByText("含估算")).toBeTruthy();
  });

  it("flags a row with a line over cap", () => {
    show({
      candidates: [{
        total: "13.30", buffer_spent: "0.30",
        lines: { D1: [person(), person({ key: "p2", first_name: "方朔" })] },
        line_totals: { D1: { total: "13.30", cap: "13.00", over: "0.30" } },
      }],
    });
    expect(rows().getByText("超 cap")).toBeTruthy();
  });

  it("shows buffer spent/total in the expanded panel", () => {
    show(); // buffer_spent 0.00, bufferTotal 0.50
    const toggle = rows().getAllByRole("button")[0];
    fireEvent.click(toggle);
    const panel = screen.getByTestId("candidate-lines");
    expect(panel.textContent).toContain("0.00/0.50");
  });

  it("puts no cost flag on an all-frozen, within-cap candidate", () => {
    show(); // default: frozen, over 0.00
    const firstRow = rows().getAllByRole("listitem")[0];
    expect(within(firstRow).queryByText("含估算")).toBeNull();
    expect(within(firstRow).queryByText("超 cap")).toBeNull();
  });

  it("expands a row to the five lines and collapses again", () => {
    show({ candidates: threeCandidates() });
    const toggle = rows().getAllByRole("button")[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const li = toggle.closest("li")!;
    expect(within(li).queryByTestId("candidate-lines")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(li).getByTestId("candidate-lines")).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(within(li).queryByTestId("candidate-lines")).toBeNull();
  });
});
