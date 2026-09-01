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

  it("renders the unavailable destination as disabled, not as a link", () => {
    renderSidebar();

    // 分析 was replaced by 阵容 (which exists) and 对手对比 (which does not).
    const item = screen.getByText("对手对比").closest("div");
    expect(item).not.toBeNull();
    // A dead link that navigates to a blank or erroring page is worse than
    // an honestly disabled item — this app has been bitten by one before.
    expect(item!.querySelector("a")).toBeNull();
    expect(item).toHaveAttribute("aria-disabled", "true");

    expect(screen.getAllByText("未开放")).toHaveLength(1);
  });

  it("does not paint the season switcher with the light page background", () => {
    const { container } = renderSidebar();

    const summary = container.querySelector("summary")!;
    // The control sits inside the dark sidebar and its label is near-white
    // (#f2eee7). bg-background is the LIGHT page colour (#f6f4f0), so the two
    // together left "2026 · 银组" barely legible — the mock puts a near-black
    // well behind it instead.
    expect(summary.className).not.toMatch(/bg-background/);
    expect(summary.className).toMatch(/bg-sidebar-well/);
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

describe("Sidebar 阵容 and 对手对比", () => {
  it("links 阵容 to the division's lineup page", () => {
    renderSidebar();

    const link = screen.getByRole("link", { name: /阵容/ });
    expect(link.getAttribute("href")).toBe("/2026/silver/lineup");
    expect(link.textContent).not.toContain("未开放");
  });

  it("links 阵容 straight to the team in scope when there is one", () => {
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="teams"
        teamCode="PKU"
      />,
    );

    // From a team's roster, 阵容 means that team's lineup — going back
    // through a picker to re-select the team already on screen is a step
    // nobody wants.
    expect(screen.getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup/PKU",
    );
  });

  it("renders 对手对比 as disabled, and no longer offers 分析", () => {
    renderSidebar();

    // 分析 was ambiguous: comparing opponents is exactly what this change
    // does NOT do, and one item named for both would claim it does.
    expect(screen.queryByText("分析")).toBeNull();

    const item = screen.getByText("对手对比").closest("div");
    expect(item).not.toBeNull();
    expect(item!.querySelector("a")).toBeNull();
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("says 对手对比 is disabled with colour, not with opacity", () => {
    renderSidebar();

    // Opacity blends the token into whatever is behind it, so the contrast a
    // reader actually gets cannot be worked out from the source. This row was
    // text-sidebar-foreground-dim at opacity-45 — #413f38 on #1c1b18, 1.63:1,
    // which is close to invisible. Disabled has to be said in colour.
    // Only the text-carrying elements. The nav icon keeps opacity-85, which
    // every row uses including the enabled ones — it is not how this row says
    // "disabled", and it measures 3.98:1, above the 3:1 non-text needs.
    const item = screen.getByText("对手对比").closest("div")!;
    const textNodes = [item, ...item.querySelectorAll("span")];
    for (const node of textNodes) {
      expect(node.getAttribute("class") ?? "").not.toMatch(/opacity-/);
    }
    expect(item.getAttribute("class")).toMatch(/text-sidebar-foreground-dim/);
  });

  it("marks 阵容 as the current page on the lineup section", () => {
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="lineup"
      />,
    );

    expect(screen.getByText("阵容").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("Sidebar 队员管理 and the signed-in state", () => {
  it("links 队员管理 to the admin pages", () => {
    renderSidebar();

    const link = screen.getByRole("link", { name: /队员管理/ });
    expect(link.getAttribute("href")).toBe("/2026/silver/players");
    // It exists, so it is a link — not a disabled row with 未开放.
    expect(link.textContent).not.toContain("未开放");
  });

  it("marks 队员管理 as current on its own pages", () => {
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        section="players"
      />,
    );

    expect(screen.getByText("队员管理").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows who is signed in, with a way out", () => {
    render(
      <Sidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        signedIn
      />,
    );

    expect(screen.getByText("管理员")).toBeTruthy();
    expect(screen.getByRole("button", { name: "登出" })).toBeTruthy();
  });

  it("shows nothing that looks signed in when nobody is", () => {
    renderSidebar();

    // A logged-out reader seeing an identity would misread who can change
    // things — reading pages needs no login at all.
    expect(screen.queryByText("管理员")).toBeNull();
    expect(screen.queryByRole("button", { name: "登出" })).toBeNull();
  });
});
