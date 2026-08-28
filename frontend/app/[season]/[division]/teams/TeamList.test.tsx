import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { TeamSummary } from "@/lib/api";
import { TeamList } from "./TeamList";

const TEAMS: TeamSummary[] = [
  {
    code: "TEST-ALPHA",
    display_name: "甲队",
    player_count: 15,
    men_count: 11,
    women_count: 4,
    unknown_gender_count: 0,
  },
  {
    code: "TEST-BETA-GAMMA",
    display_name: null,
    player_count: 20,
    men_count: 14,
    women_count: 6,
    unknown_gender_count: 0,
  },
  {
    code: "TEST-DELTA",
    display_name: null,
    player_count: 12,
    men_count: 8,
    women_count: 3,
    unknown_gender_count: 1,
  },
];

function renderList(selected?: string) {
  return render(
    <TeamList
      season="2025"
      division="silver"
      teams={TEAMS}
      selected={selected}
    />,
  );
}

function row(code: string): HTMLElement {
  return screen.getByRole("listitem", { name: new RegExp(code) });
}

describe("TeamList", () => {
  it("shows every team's code, head count and gender split", () => {
    renderList();

    const alpha = row("TEST-ALPHA");
    expect(within(alpha).getByText("15 人")).toBeTruthy();
    expect(within(alpha).getByText(/11男/)).toBeTruthy();
    expect(within(alpha).getByText(/4女/)).toBeTruthy();
  });

  it("shows a display name when there is one", () => {
    renderList();

    expect(within(row("TEST-ALPHA")).getByText("甲队")).toBeTruthy();
  });

  it("shows only the code when a team has no name", () => {
    // Joint sides mostly have no natural Chinese name. Deriving one from the
    // code would put a name on screen that nobody chose.
    renderList();

    const beta = row("TEST-BETA-GAMMA");
    expect(within(beta).getByText("TEST-BETA-GAMMA")).toBeTruthy();
    expect(within(beta).queryByText(/队$/)).toBeNull();
  });

  it("counts players with no gender in their own bucket", () => {
    // Not folded into 男 or 女: that would show one more player on a side
    // than the team actually has, and the side counts are the point.
    renderList();

    const delta = row("TEST-DELTA");
    expect(within(delta).getByText(/8男/)).toBeTruthy();
    expect(within(delta).getByText(/3女/)).toBeTruthy();
    expect(within(delta).getByText(/1性别未填/)).toBeTruthy();
  });

  it("omits the unknown-gender bucket when it is empty", () => {
    // Every row would otherwise carry a "0性别未填" that is never useful.
    renderList();

    expect(within(row("TEST-ALPHA")).queryByText(/性别未填/)).toBeNull();
  });

  it("links each team to its own roster URL", () => {
    // The selected team lives in the URL, not in component state: a
    // selection held in React would disagree with the address bar, and
    // reloading or sharing the link would lose it.
    renderList();

    const link = within(row("TEST-ALPHA")).getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/2025/silver/teams/TEST-ALPHA",
    );
  });

  it("marks the selected team and does not link it to itself", () => {
    renderList("TEST-ALPHA");

    const alpha = row("TEST-ALPHA");
    expect(alpha.getAttribute("aria-current")).toBe("true");
    expect(within(alpha).queryByRole("link")).toBeNull();
    // The others stay reachable.
    expect(within(row("TEST-DELTA")).getByRole("link")).toBeTruthy();
  });

  it("keeps the order it was given", () => {
    // The backend already sorts by code. Sorting again here would be a
    // second opinion on the same question.
    renderList();

    const codes = screen
      .getAllByRole("listitem")
      .map((item) => item.getAttribute("aria-label"));
    expect(codes).toEqual(["TEST-ALPHA", "TEST-BETA-GAMMA", "TEST-DELTA"]);
  });

  it("names the division's team and player totals", () => {
    renderList();

    expect(screen.getByText("球队 · 3")).toBeTruthy();
    expect(screen.getByText("47 人")).toBeTruthy();
  });
});
