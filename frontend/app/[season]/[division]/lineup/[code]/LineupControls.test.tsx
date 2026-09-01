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
