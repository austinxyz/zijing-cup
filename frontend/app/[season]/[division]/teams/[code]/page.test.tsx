import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notFound } from "next/navigation";
import { getTeamRoster, type TeamRoster } from "@/lib/api";
import Page from "./page";

// The page asks whether to offer the edit controls; there is no request
// scope in a unit test, so the answer is stubbed. Signed out is the default
// here — the affordances have their own tests in RosterTable.
vi.mock("@/lib/admin", () => ({ isSignedIn: vi.fn(async () => false) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getTeamRoster: vi.fn() };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const ROSTER: TeamRoster = {
  team: {
    code: "TEST-ALPHA",
    display_name: "甲队",
    season_year: 2025,
    division_code: "silver",
  },
  players: [
    {
      player_id: 1,
      last_name: "南",
      first_name: "望舒",
      gender: "M",
      match_utr: "6.50",
      origin: "frozen",
      origin_year: 2025,
      is_unresolved: false,
      under_appeal: false,
      dutr_status: null,
      rating_class: "verified",
      source_note: null,
      daily_utrs: [],
      singles_utr: null,
      singles_status: null,
      doubles_utr: null,
      doubles_status: null,
      is_borrowed_player: null,
      utr_profile_id: null,
    },
    {
      player_id: 2,
      last_name: "西",
      first_name: "门吹雪",
      gender: "F",
      match_utr: "4.00",
      origin: "frozen",
      origin_year: 2025,
      is_unresolved: false,
      under_appeal: false,
      dutr_status: null,
      rating_class: null,
      source_note: null,
      daily_utrs: [],
      singles_utr: null,
      singles_status: null,
      doubles_utr: null,
      doubles_status: null,
      is_borrowed_player: null,
      utr_profile_id: null,
    },
  ],
  locked: false,
};

function params() {
  return Promise.resolve({
    season: "2025",
    division: "silver",
    code: "TEST-ALPHA",
  });
}

describe("team roster page", () => {
  afterEach(() => vi.clearAllMocks());

  it("names the team by its code with the display name beside it", async () => {
    // The code is the identity everyone uses; the Chinese name is the
    // friendlier second line, not a replacement.
    vi.mocked(getTeamRoster).mockResolvedValue(ROSTER);

    render(await Page({ params: params() }));

    expect(screen.getByText("TEST-ALPHA")).toBeTruthy();
    expect(screen.getByText("甲队")).toBeTruthy();
  });

  it("summarises the roster size and its gender split", async () => {
    vi.mocked(getTeamRoster).mockResolvedValue(ROSTER);

    render(await Page({ params: params() }));

    expect(screen.getByText("2 人")).toBeTruthy();
    expect(screen.getByText("1 男 · 1 女")).toBeTruthy();
  });

  it("says the UTR shown is the frozen one", async () => {
    // The number on this page is not a player's live rating, and a captain
    // comparing it against the UTR site needs to know that.
    vi.mocked(getTeamRoster).mockResolvedValue(ROSTER);

    render(await Page({ params: params() }));

    expect(screen.getByText("参赛 UTR · 赛前冻结")).toBeTruthy();
  });

  it("renders every player", async () => {
    vi.mocked(getTeamRoster).mockResolvedValue(ROSTER);

    render(await Page({ params: params() }));

    // Names appear in both the table and the mobile card list; scope to the
    // table so the assertion is about presence, not which DOM.
    const t = within(screen.getByRole("table"));
    expect(t.getByText("南 望舒")).toBeTruthy();
    expect(t.getByText("西 门吹雪")).toBeTruthy();
  });

  it("offers a link back to the team list for narrow viewports", async () => {
    vi.mocked(getTeamRoster).mockResolvedValue(ROSTER);

    render(await Page({ params: params() }));

    // On mobile the list and roster are separate screens; without this a
    // captain who tapped a team is stuck on it. Desktop keeps both columns,
    // so the link is md:hidden — present in the DOM, hidden by the breakpoint.
    const back = screen.getByRole("link", { name: /球队列表/ });
    expect(back.getAttribute("href")).toBe("/2025/silver/teams");
    expect(back.className).toMatch(/md:hidden/);
  });

  it("is a not-found for an unknown team, not an empty roster", async () => {
    // An empty table would say "this team has no players", which is a
    // different and false claim about a team that does not exist.
    vi.mocked(getTeamRoster).mockResolvedValue(null);

    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
