import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notFound } from "next/navigation";
import { getTeamRoster, type TeamRoster } from "@/lib/api";
import Page from "./page";

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
      last_name: "南",
      first_name: "望舒",
      gender: "M",
      match_utr: "6.50",
      dutr_status: "Rated",
      rating_class: "verified",
      source_note: null,
      daily_utrs: [],
      is_borrowed_player: null,
      utr_profile_id: null,
    },
    {
      last_name: "西",
      first_name: "门吹雪",
      gender: "F",
      match_utr: "4.00",
      dutr_status: "Unrated",
      rating_class: null,
      source_note: "Captain Provided UTR",
      daily_utrs: [],
      is_borrowed_player: null,
      utr_profile_id: null,
    },
  ],
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

    expect(screen.getByText("南 望舒")).toBeTruthy();
    expect(screen.getByText("西 门吹雪")).toBeTruthy();
  });

  it("is a not-found for an unknown team, not an empty roster", async () => {
    // An empty table would say "this team has no players", which is a
    // different and false claim about a team that does not exist.
    vi.mocked(getTeamRoster).mockResolvedValue(null);

    await expect(Page({ params: params() })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
