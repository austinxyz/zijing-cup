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

  it("renders 队伍 and 分析 as disabled, not as links", () => {
    renderSidebar();

    for (const label of ["队伍", "分析"]) {
      const item = screen.getByText(label).closest("div");
      expect(item).not.toBeNull();
      // A dead link that navigates to a blank or erroring page is worse than
      // an honestly disabled item — this app has been bitten by one before.
      expect(item!.querySelector("a")).toBeNull();
      expect(item).toHaveAttribute("aria-disabled", "true");
    }

    expect(screen.getAllByText("未开放")).toHaveLength(2);
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
