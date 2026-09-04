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
    borrowed_over_limit: null,
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

describe("candidate cards (3-row line blocks)", () => {
  function cards() {
    return within(screen.getByTestId("candidate-cards"));
  }

  it("renders one card per candidate, in the backend order", () => {
    show({ candidates: threeCandidates() });
    const items = cards().getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const totals = items.map(
      (it) => within(it).getByText(/^1[23]\.\d\d$/).textContent,
    );
    expect(totals).toEqual(["13.00", "12.80", "12.60"]);
  });

  it("shows each line as a block: both players, gender symbol and the line sum", () => {
    show();
    const block = cards().getByLabelText("D1");
    expect(within(block).getByText("南 望舒")).toBeTruthy();
    expect(within(block).getByText("南 方朔")).toBeTruthy();
    expect(within(block).getAllByText("♂").length).toBe(2);
    expect(within(block).getByText(/13\.00/)).toBeTruthy();
  });

  it("flags a line over cap in danger", () => {
    show({
      candidates: [{
        total: "13.30", buffer_spent: "0.30",
        lines: { D1: [person(), person({ key: "p2", first_name: "方朔" })] },
        line_totals: { D1: { total: "13.30", cap: "13.00", over: "0.30" } },
      }],
    });
    expect(cards().getByText(/超\s*0\.30/)).toBeTruthy();
  });

  it("marks an estimated number and carries the full sentence on the set badge", () => {
    const derived = person({ key: "p2", first_name: "方朔", origin: "prior_season", origin_year: 2024 });
    show({
      candidates: [{
        total: "13.00", buffer_spent: "0.00",
        lines: { D1: [person(), derived] },
        line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
      }],
      estimated_count: 1,
    });
    expect(cards().getAllByTitle("估算值").length).toBeGreaterThan(0);
    expect(cards().getByText("含估算")).toBeTruthy();
  });

  it("shows the team buffer spent/total on each card", () => {
    show(); // buffer_spent 0.00, bufferTotal 0.50
    expect(cards().getByText(/0\.00\s*\/\s*0\.50/)).toBeTruthy();
  });

  it("puts no estimate badge on an all-frozen candidate", () => {
    show();
    expect(cards().queryByText("含估算")).toBeNull();
  });
});

describe("borrowed players", () => {
  it("marks a borrowed player in a candidate line block", () => {
    const borrowed = person({ key: "p2", first_name: "方朔", is_borrowed_player: true });
    show({
      candidates: [{
        total: "13.00", buffer_spent: "0.00",
        lines: { D1: [person(), borrowed] },
        line_totals: { D1: { total: "13.00", cap: "13.00", over: "0.00" } },
      }],
    });
    const block = within(screen.getByTestId("candidate-cards")).getByLabelText("D1");
    const row = within(block).getByText("南 方朔").closest("div")!;
    expect(within(row).getByText("外")).toBeTruthy();
  });

  it("explains an over-the-borrowed-limit team with names and caps", () => {
    show({
      candidates: [],
      borrowed_over_limit: { names: ["南 方朔", "南 子墨"], on_court: 2, cap: 1 },
    });
    expect(screen.getByText(/凑不出合法阵容/)).toBeTruthy();
    expect(screen.getByText(/南 方朔、南 子墨/)).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
  });
});
