import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayers, type Player } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getPlayers: vi.fn(),
    getPlayersPage: vi.fn(async () => ({ players: [], total: 0, truncated: false })),
  };
});

vi.mock("@/lib/admin", () => ({ isSignedIn: vi.fn(async () => true) }));

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 1,
    last_name: "Zong",
    first_name: "Qingqing",
    gender: "F",
    singles_utr: "6.41",
    singles_status: "rated",
    doubles_utr: "6.38",
    doubles_status: "rated",
    utr_profile_id: "3872011",
    season_utrs: [],
    memberships: [],
    ...overrides,
  };
}

const CONTESTED = player({
  season_utrs: [
    {
      season_year: 2025,
      value: "6.38",
      alt_value: "6.25",
      is_unresolved: true,
      value_division: null,
      alt_value_division: null,
      status: "verified",
      under_appeal: false,
      source: "committee_sheet",
    },
  ],
  memberships: [
    {
      id: 1,
      team_id: 1,
      team_code: "THU-UOC",
      season_year: 2025,
      division_code: "gold",
      representing_school: "清华",
      is_borrowed_player: null,
      is_wildcard: null,
    },
    {
      id: 2,
      team_id: 2,
      team_code: "THU-I",
      season_year: 2025,
      division_code: "silver",
      representing_school: "清华",
      is_borrowed_player: null,
      is_wildcard: null,
    },
  ],
});

const PREFILLED = player({
  id: 2,
  last_name: "Zhang",
  first_name: "Qingyang",
  utr_profile_id: null,
  singles_utr: null,
  singles_status: "unrated",
  doubles_utr: null,
  doubles_status: "unrated",
  season_utrs: [
    {
      season_year: 2026,
      value: "4.25",
      alt_value: null,
      is_unresolved: false,
      value_division: null,
      alt_value_division: null,
      status: null,
      under_appeal: false,
      source: "prefilled",
    },
  ],
});

function renderPage(query: Record<string, string> = {}) {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver" }),
    searchParams: Promise.resolve(query),
  });
}

afterEach(() => vi.clearAllMocks());

describe("the player list", () => {
  it("lists every team a player belongs to, not just one", async () => {
    vi.mocked(getPlayers).mockResolvedValue([CONTESTED]);

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Zong Qingqing/ });
    // The rules let one person play gold and silver in the same season, so
    // showing a single team would answer "where is this person" wrongly.
    expect(within(row).getByText(/THU-UOC/)).toBeTruthy();
    expect(within(row).getByText(/THU-I/)).toBeTruthy();
  });

  it("marks an unresolved value and a prefilled one the same way", async () => {
    vi.mocked(getPlayers).mockResolvedValue([CONTESTED, PREFILLED]);

    render(await renderPage());

    // Scoped to the table: the queue link in the header carries the same word,
    // and it is a destination rather than a marker on a value.
    const table = screen.getByRole("table");
    const unresolved = within(table).getByText("未裁决");
    const prefilled = within(table).getByText("预填");
    // Same tier of warning: both say "this number has not been confirmed by
    // the committee", which is one fact, not two.
    expect(unresolved.className).toBe(prefilled.className);
  });

  it("shows a missing UTR link without calling it an error", async () => {
    vi.mocked(getPlayers).mockResolvedValue([PREFILLED]);

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Zhang Qingyang/ });
    const marker = within(row).getByText("无");
    // Nobody has filled it in yet — that is a gap to close, not a fault, and
    // it is the evidence a future merge would rest on.
    expect(marker.className).not.toMatch(/danger/);
  });

  it("offers the unresolved queue as a destination", async () => {
    vi.mocked(getPlayers).mockResolvedValue([CONTESTED, PREFILLED]);

    render(await renderPage());

    // The count itself comes from the server — see "counts the page cannot
    // see" below. What this checks is that the queue is reachable from here.
    const link = screen.getByRole("link", { name: /未裁决/ });
    expect(link.getAttribute("href")).toBe("/2026/silver/players/unresolved");
  });

  it("keeps the search box filled with what was searched", async () => {
    vi.mocked(getPlayers).mockResolvedValue([]);

    render(await renderPage({ q: "Zong" }));

    expect(getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Zong" }),
    );
    expect(
      (screen.getByLabelText("搜索队员") as HTMLInputElement).defaultValue,
    ).toBe("Zong");
  });

  it("says so when nothing matches, instead of showing an empty table", async () => {
    vi.mocked(getPlayers).mockResolvedValue([]);

    render(await renderPage({ q: "nobody" }));

    expect(screen.getByText(/没有匹配的队员/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("counts the page cannot see", () => {
  it("takes the unresolved count from the server, not from the rows it drew", async () => {
    vi.mocked(getPlayers).mockResolvedValue([CONTESTED]);
    const { getPlayersPage } = await import("@/lib/api");
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [],
      total: 17,
      truncated: false,
    });

    render(await renderPage());

    // The list is capped; counting unresolved rows inside it would report 7
    // when the answer is 17, and nothing on screen would say the number was a
    // guess.
    expect(screen.getByRole("link", { name: /未裁决/ }).textContent).toMatch(/17/);
  });

  it("says when it is showing only part of the roster", async () => {
    const { getPlayersPage } = await import("@/lib/api");
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [],
      total: 17,
      truncated: false,
    });
    vi.mocked(getPlayers).mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => player({ id: i + 1 })),
    );

    render(await renderPage());

    expect(screen.queryByText(/只显示前/)).toBeTruthy();
  });
});
