import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LineupPlayer, RuleLine } from "@/lib/api";
import { LineupControls } from "./LineupControls";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
];

function roster(count: number): LineupPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `p${i + 1}`,
    last_name: "南",
    first_name: `队员${i + 1}`,
    origin: "frozen",
    origin_year: 2026,
    is_unresolved: false,
    gender: i % 3 === 0 ? "F" : "M",
    match_utr: "5.00",
  }));
}

describe("the lock and exclude panel", () => {
  it("marks a hot-hand player (≥60%) with ▲ in the select options and exclude chips", () => {
    const hot: LineupPlayer = {
      key: "p1", last_name: "南", first_name: "热手",
      origin: "frozen", origin_year: 2026, is_unresolved: false,
      gender: "M", match_utr: "6.00", wins: 67, losses: 20,
    };
    const cold: LineupPlayer = {
      key: "p2", last_name: "南", first_name: "平手",
      origin: "frozen", origin_year: 2026, is_unresolved: false,
      gender: "M", match_utr: "5.80", wins: 1, losses: 1,
    };
    render(
      <LineupControls lines={LINES} roster={[hot, cold]} locks={{}} excluded={[]} />,
    );
    // partner-select option
    const opt = screen.getAllByRole("option").find((o) => /热手/.test(o.textContent ?? ""));
    expect(opt?.textContent).toMatch(/▲/);
    const coldOpt = screen.getAllByRole("option").find((o) => /平手/.test(o.textContent ?? ""));
    expect(coldOpt?.textContent ?? "").not.toMatch(/▲/);
    // exclude chip
    const hotChip = screen.getByText("南 热手").closest("label")!;
    expect(hotChip.textContent).toMatch(/▲/);
  });

  it("carries a hidden go=1 so submitting the controls runs the search", () => {
    const { container } = render(
      <LineupControls lines={LINES} roster={roster(6)} locks={{}} excluded={[]} />,
    );
    const go = container.querySelector('input[name="go"]') as HTMLInputElement;
    expect(go).toBeTruthy();
    expect(go.value).toBe("1");
  });

  it("is wide enough that a full roster's chips do not need scrolling", () => {
    const { container } = render(
      <LineupControls lines={LINES} roster={roster(26)} locks={{}} excluded={[]} />,
    );

    // 26 is the largest roster on record. At 420px its exclusion chips wrapped
    // to ten rows and pushed the panel past a 640px-tall window, so the panel
    // scrolled while the page around it did not — the scrollbar was the only
    // hint the search button was still down there.
    const form = container.querySelector("form")!;
    expect(form.className).toContain("w-[520px]");
  });

  it("still keeps its own scroll container", () => {
    const { container } = render(
      <LineupControls lines={LINES} roster={roster(60)} locks={{}} excluded={[]} />,
    );

    // Width buys headroom, it does not bound the roster: a big enough team
    // overflows any fixed width, and inside an h-screen overflow-hidden shell
    // the overflow would be cut off silently, with no scrollbar to say so.
    const form = container.querySelector("form")!;
    expect(form.className).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: "搜索阵容" })).toBeTruthy();
  });
});

describe("the drawer variant's touch targets", () => {
  it("makes the selects and exclusion chips 44px tall on mobile", () => {
    const { container } = render(
      <LineupControls
        lines={LINES}
        roster={roster(3)}
        locks={{}}
        excluded={[]}
        variant="drawer"
      />,
    );
    for (const select of container.querySelectorAll("select")) {
      expect(select.className).toMatch(/h-11\b/);
      // Must be able to shrink past a long option name, not force overflow.
      expect(select.className).toMatch(/min-w-0/);
    }
    for (const label of container.querySelectorAll('label:has(input[type="checkbox"])')) {
      expect(label.className).toMatch(/min-h-11\b/);
    }
    const submit = screen.getByRole("button", { name: "搜索阵容" });
    expect(submit.className).toMatch(/h-11\b/);
  });

  it("keeps the desktop column compact (34px selects)", () => {
    const { container } = render(
      <LineupControls lines={LINES} roster={roster(3)} locks={{}} excluded={[]} />,
    );
    for (const select of container.querySelectorAll("select")) {
      expect(select.className).toMatch(/h-\[34px\]/);
    }
  });
})

import { orderForSelect } from "./LineupControls";

function p(key: string, gender: string | null, utr: string): LineupPlayer {
  return {
    key, last_name: "南", first_name: key, gender,
    match_utr: utr, origin: "frozen", origin_year: 2025, is_unresolved: false,
  };
}

describe("orderForSelect", () => {
  it("groups men first, then women, then unknown gender", () => {
    const out = orderForSelect([
      p("f1", "F", "6.0"),
      p("m1", "M", "5.0"),
      p("u1", null, "9.9"),
    ]).map((x) => x.key);
    expect(out).toEqual(["m1", "f1", "u1"]);
  });

  it("orders by UTR high-to-low within a gender", () => {
    const out = orderForSelect([
      p("m_low", "M", "5.20"),
      p("m_high", "M", "6.80"),
      p("m_mid", "M", "6.00"),
    ]).map((x) => x.key);
    expect(out).toEqual(["m_high", "m_mid", "m_low"]);
  });

  it("compares UTR as a number, not a string", () => {
    // "10.00" > "9.00" numerically, but "10.00" < "9.00" as strings.
    const out = orderForSelect([
      p("nine", "M", "9.00"),
      p("ten", "M", "10.00"),
    ]).map((x) => x.key);
    expect(out).toEqual(["ten", "nine"]);
  });

  it("does not mutate the input array", () => {
    const input = [p("f1", "F", "6.0"), p("m1", "M", "5.0")];
    const before = input.map((x) => x.key);
    orderForSelect(input);
    expect(input.map((x) => x.key)).toEqual(before);
  });
});

describe("three line states: empty / pin / hard lock", () => {
  it("marks a pinned line (one seat) as 已钉 with an engine-fills hint", () => {
    render(
      <LineupControls
        lines={LINES}
        roster={roster(6)}
        locks={{ WD: ["p2", "p3"] }}
        pins={{ D1: "p1" }}
        excluded={[]}
      />,
    );
    expect(screen.getByText("已钉")).toBeTruthy();
    expect(screen.getByText(/搭档交给引擎/)).toBeTruthy();
    // the hard-locked line reads as a full lock, not a pin
    expect(screen.getByText("锁整对")).toBeTruthy();
  });

  it("shows neither badge when nothing is pinned or locked", () => {
    render(
      <LineupControls lines={LINES} roster={roster(6)} locks={{}} pins={{}} excluded={[]} />,
    );
    expect(screen.queryByText("已钉")).toBeNull();
    expect(screen.queryByText("锁整对")).toBeNull();
  });
});
