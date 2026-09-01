import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TopNav } from "./TopNav";

const SEASONS = [
  {
    year: 2026,
    edition_name: "第十一届",
    divisions: [
      { code: "gold", display_name: "金组" },
      { code: "silver", display_name: "银组" },
    ],
  },
  {
    year: 2025,
    edition_name: "第十届",
    divisions: [
      { code: "gold", display_name: "金组" },
      { code: "silver", display_name: "银组" },
    ],
  },
];

function renderTopNav(overrides = {}) {
  return render(
    <TopNav
      season="2025"
      division="silver"
      divisionName="银组"
      seasons={SEASONS}
      section="teams"
      {...overrides}
    />,
  );
}

describe("TopNav", () => {
  it("shows exactly the four read destinations, not 队员管理", () => {
    renderTopNav({ signedIn: true });

    const tabs = screen.getByRole("navigation");
    expect(within(tabs).getByText("队伍")).toBeTruthy();
    expect(within(tabs).getByText("阵容")).toBeTruthy();
    expect(within(tabs).getByText("对手对比")).toBeTruthy();
    expect(within(tabs).getByText("赛制规则")).toBeTruthy();
    // The admin screen has no narrow layout, so its entry stays off the bar
    // even for a signed-in admin — putting it here would push a page that can
    // only scroll sideways at the most prominent spot.
    expect(within(tabs).queryByText("队员管理")).toBeNull();
  });

  it("takes its colours from the sidebar tokens, not the content area", () => {
    const { container } = renderTopNav();
    const bar = container.querySelector('[data-testid="top-bar"]');
    expect(bar?.className).toMatch(/bg-sidebar\b/);
  });

  it("marks the current section from the URL-derived prop", () => {
    renderTopNav({ section: "teams" });
    const current = screen.getByRole("link", { name: "队伍" });
    expect(current.getAttribute("aria-current")).toBe("page");
  });

  it("renders 对手对比 as disabled, not a link", () => {
    renderTopNav();
    const opp = screen.getByText("对手对比").closest("[aria-disabled]");
    expect(opp).not.toBeNull();
    expect(opp!.querySelector("a")).toBeNull();
    expect(screen.getByText("未开放")).toBeTruthy();
  });

  it("gives every tab a 44px touch target", () => {
    renderTopNav();
    const tabs = screen.getByRole("navigation");
    for (const tab of tabs.querySelectorAll('[data-tab]')) {
      expect(tab.className).toMatch(/h-11\b/);
    }
  });

  it("opens 阵容 on the team in scope", () => {
    renderTopNav({ teamCode: "THU", section: "lineup" });
    const lineup = screen.getByRole("link", { name: "阵容" });
    expect(lineup.getAttribute("href")).toBe("/2025/silver/lineup/THU");
  });
});
