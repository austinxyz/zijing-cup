import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sidebar } from "./Sidebar";

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

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  return render(
    <Sidebar
      season="2026"
      division="silver"
      divisionName="银组"
      seasons={SEASONS}
      {...overrides}
    />,
  );
}

describe("Sidebar navigation", () => {
  it("marks the rules page as the current page", () => {
    renderSidebar();

    const rules = screen.getByText("赛制规则").closest("[aria-current]");
    expect(rules).toHaveAttribute("aria-current", "page");
  });

  it("links 队伍 to the division's team list", () => {
    renderSidebar();

    const link = screen.getByRole("link", { name: /队伍/ });
    expect(link.getAttribute("href")).toBe("/2026/silver/teams");
    // No longer carries the unavailable marker.
    expect(link.textContent).not.toContain("未开放");
  });

  it("renders 分析 as disabled, not as a link", () => {
    renderSidebar();

    const item = screen.getByText("分析").closest("div");
    expect(item).not.toBeNull();
    // A dead link that navigates to a blank or erroring page is worse than
    // an honestly disabled item — this app has been bitten by one before.
    expect(item!.querySelector("a")).toBeNull();
    expect(item).toHaveAttribute("aria-disabled", "true");

    expect(screen.getAllByText("未开放")).toHaveLength(1);
  });

  it("uses the sidebar design tokens", () => {
    const { container } = renderSidebar();

    const aside = container.querySelector("aside");
    expect(aside?.className).toMatch(/bg-sidebar/);
    // 216px, from the design system this app shares with ai-course-management.
    expect(aside?.className).toMatch(/w-\[216px\]/);
  });
});

describe("Season and division switcher", () => {
  it("shows the current season and division as one collapsed control", () => {
    renderSidebar();

    // One control naming both, not two separate dropdowns: switching
    // divisions changes which rules apply, not merely which rows are shown.
    expect(
      screen.getByRole("group", { name: "赛季与组别" }).querySelector("summary")
        ?.textContent,
    ).toContain("2026 · 银组");
  });

  it("lists every season and division, not just the ones you are not on", () => {
    renderSidebar();

    const switcher = screen.getByRole("group", { name: "赛季与组别" });
    const entries = within(switcher)
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    // All four, always. Hiding the current pair makes the option set change
    // membership every time you switch, so you never see the whole picture
    // and the list appears to rewrite itself under you.
    expect(entries).toEqual([
      "2026 · 金组",
      "2026 · 银组",
      "2025 · 金组",
      "2025 · 银组",
    ]);
  });

  it("marks the current pair as selected and does not link it to itself", () => {
    renderSidebar();

    const switcher = screen.getByRole("group", { name: "赛季与组别" });
    // The label also appears in the collapsed summary, so scope to the list.
    const current = within(switcher)
      .getAllByRole("listitem")
      .find((item) => item.textContent === "2026 · 银组")!;
    expect(current.querySelector("a")).toBeNull();
    expect(current.firstElementChild).toHaveAttribute("aria-current", "true");

    const hrefs = within(switcher)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/2026/gold/rules",
      "/2025/gold/rules",
      "/2025/silver/rules",
    ]);
  });

  it("renders the sole rule set with nothing to switch to", () => {
    renderSidebar({
      seasons: [
        {
          year: 2026,
          edition_name: "第十一届",
          divisions: [{ code: "silver", display_name: "银组" }],
        },
      ],
    });

    const switcher = screen.getByRole("group", { name: "赛季与组别" });
    expect(within(switcher).getAllByRole("listitem")).toHaveLength(1);
    expect(within(switcher).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("Sidebar active section", () => {
  it("marks 赛制规则 as the current page on the rules route", () => {
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="rules"
      />,
    );

    expect(screen.getByText("赛制规则").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /队伍/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks 队伍 as the current page on the teams route", () => {
    // Now that 队伍 is reachable, leaving 赛制规则 hardcoded as current would
    // tell the reader they are on a page they are not on.
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="teams"
      />,
    );

    expect(screen.getByText("队伍").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("赛制规则").closest("[aria-current]")).toBeNull();
  });

  it("still links 队伍 when it is the current section", () => {
    // Unlike the season switcher, the nav item stays a link: it is how you
    // get back from a team's roster to the list.
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="teams"
      />,
    );

    expect(
      screen.getByRole("link", { name: /队伍/ }).getAttribute("href"),
    ).toBe("/2026/silver/teams");
  });
});
