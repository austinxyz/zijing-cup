import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayers, getPlayer, getPlayerNotes, type Player } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getPlayers: vi.fn(async () => []),
    getPlayer: vi.fn(async () => null),
    getPlayerNotes: vi.fn(async () => []),
    getPlayersPage: vi.fn(async () => ({ players: [], total: 0, truncated: false })),
    getSeasons: vi.fn(async () => [
      {
        year: 2026,
        edition_name: "第十一届",
        divisions: [{ code: "silver", display_name: "银组" }],
      },
      {
        year: 2025,
        edition_name: "第十届",
        divisions: [{ code: "silver", display_name: "银组" }],
      },
    ]),
  };
});

vi.mock("@/lib/admin", () => ({
  isSignedIn: vi.fn(async () => false),
  canEdit: vi.fn(async () => false),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

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
    season_utrs: [
      {
        season_year: 2025,
        value: "6.38",
        alt_value: null,
        is_unresolved: false,
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
    ...overrides,
  };
}

function renderPage(query: Record<string, string> = {}) {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver" }),
    searchParams: Promise.resolve(query),
  });
}

afterEach(() => vi.clearAllMocks());

describe("workbench left column: search", () => {
  it("offers name, gender, team and year search fields", async () => {
    render(await renderPage());
    expect(screen.getByLabelText("姓名")).toBeTruthy();
    expect(screen.getByLabelText("性别")).toBeTruthy();
    expect(screen.getByLabelText("所在队伍")).toBeTruthy();
    expect(screen.getByLabelText("参赛年份")).toBeTruthy();
    expect(screen.getByRole("button", { name: "搜索" })).toBeTruthy();
  });

  it("submits as GET and does NOT carry a selection (a new search clears it)", async () => {
    const { container } = render(await renderPage({ sel: "1" }));
    const form = container.querySelector("form")!;
    expect(form.getAttribute("method")).toBe("get");
    // No hidden sel input: submitting the search drops the current selection.
    expect(form.querySelector('input[name="sel"]')).toBeNull();
  });

  it("passes the four filters through to getPlayers", async () => {
    await renderPage({ q: "Zong", gender: "F", team: "北大", year: "2025" });
    expect(getPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Zong",
        gender: "F",
        team: "北大",
        year: "2025",
      }),
    );
  });
});

describe("workbench left column: result rows", () => {
  it("shows name, gender, latest participation UTR and team, and links with ?sel", async () => {
    vi.mocked(getPlayers).mockResolvedValue([player()]);
    render(await renderPage({ q: "Zong" }));

    const link = screen.getByRole("link", { name: /Zong Qingqing/ });
    // Selecting keeps the current search and adds sel.
    expect(link.getAttribute("href")).toContain("sel=1");
    expect(link.getAttribute("href")).toContain("q=Zong");
    expect(within(link).getByText(/6\.38/)).toBeTruthy(); // latest participation UTR
    expect(within(link).getByText(/THU-UOC/)).toBeTruthy();
  });

  it("says so when nothing matches, instead of an empty list", async () => {
    vi.mocked(getPlayers).mockResolvedValue([]);
    render(await renderPage({ q: "nobody" }));
    expect(screen.getByText(/没有匹配的队员/)).toBeTruthy();
  });
});

describe("workbench right column: detail", () => {
  it("shows an empty state when nothing is selected", async () => {
    render(await renderPage());
    expect(screen.getByText(/从左边选一个队员/)).toBeTruthy();
    expect(getPlayer).not.toHaveBeenCalled();
  });

  it("shows the selected player's detail when sel is set", async () => {
    vi.mocked(getPlayer).mockResolvedValue(player());
    render(await renderPage({ sel: "1" }));
    expect(getPlayer).toHaveBeenCalledWith("1");
    // Detail renders the player's name (appears in the right pane heading).
    expect(screen.getAllByText(/Zong Qingqing/).length).toBeGreaterThan(0);
  });
});

describe("评价 confidentiality gate", () => {
  it("does NOT fetch notes and shows only the 机密 placeholder when locked", async () => {
    // canEdit defaults to false in this suite's admin mock.
    vi.mocked(getPlayer).mockResolvedValue(player());
    render(await renderPage({ sel: "1" }));

    expect(getPlayerNotes).not.toHaveBeenCalled();
    expect(screen.getByText(/评价是机密/)).toBeTruthy();
    // The append form and timeline never render for a locked viewer.
    expect(screen.queryByRole("list", { name: "评价时间线" })).toBeNull();
  });

  it("fetches notes for the selected player and renders them when unlocked", async () => {
    const { canEdit } = await import("@/lib/admin");
    vi.mocked(canEdit).mockResolvedValue(true);
    vi.mocked(getPlayer).mockResolvedValue(player());
    vi.mocked(getPlayerNotes).mockResolvedValue([
      {
        id: 5,
        category: "strength",
        body: "正手很重",
        created_at: "2026-08-28T20:03:00Z",
      },
    ]);

    render(await renderPage({ sel: "1" }));

    expect(getPlayerNotes).toHaveBeenCalledWith("1");
    expect(screen.getByText("正手很重")).toBeTruthy();
    expect(screen.queryByText(/评价是机密/)).toBeNull();
  });
});
