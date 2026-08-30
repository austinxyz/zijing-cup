import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { notFound } from "next/navigation";
import { getPlayer, type Player } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPlayer: vi.fn() };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const PLAYER: Player = {
  id: 42,
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
      season_year: 2026,
      value: "6.38",
      alt_value: null,
      is_unresolved: false,
      value_division: null,
      alt_value_division: null,
      status: "verified",
      under_appeal: false,
      source: "committee_sheet",
    },
    {
      season_year: 2025,
      value: "6.38",
      alt_value: "6.25",
      is_unresolved: true,
      value_division: null,
      alt_value_division: null,
      status: "verified",
      under_appeal: true,
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
      is_borrowed_player: false,
      is_wildcard: false,
    },
    {
      id: 3,
      team_id: 3,
      team_code: "ZJU-USC",
      season_year: 2026,
      division_code: "silver",
      representing_school: "浙大",
      is_borrowed_player: true,
      is_wildcard: true,
    },
  ],
};

function renderPage() {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver", id: "42" }),
  });
}

afterEach(() => vi.clearAllMocks());

describe("the player detail page", () => {
  it("puts the three blocks on one screen", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    // Opening a person means asking who they are, what their number is this
    // year, and which teams they are on — splitting that across pages makes
    // you jump back and forth to answer one question.
    expect(screen.getByRole("region", { name: "基本信息" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "各赛季参赛 UTR" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "队伍成员关系" })).toBeTruthy();
  });

  it("says which value an unresolved season is currently calculated with", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const banner = screen.getByRole("region", { name: "未裁决" });
    // Not just "there is a conflict": taking the larger value is a rule that
    // changes lineup results, and a rule kept in the docs is not in effect
    // anywhere the user can see.
    expect(banner.textContent).toMatch(/6\.38/);
    expect(banner.textContent).toMatch(/6\.25/);
    expect(banner.textContent).toMatch(/较大/);
  });

  it("shows both candidate values in the season row, not just the winner", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const seasons = screen.getByRole("region", { name: "各赛季参赛 UTR" });
    const row = within(seasons).getByRole("row", { name: /2025/ });
    expect(row.textContent).toMatch(/6\.25/);
  });

  it("keeps Appeal beside the status rather than replacing it", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const seasons = screen.getByRole("region", { name: "各赛季参赛 UTR" });
    const row = within(seasons).getByRole("row", { name: /2025/ });
    // Real data has Rated / Appeal, Projected / Appeal and Unrated / Appeal,
    // so Appeal cannot be a fourth status.
    expect(within(row).getByText("已认证")).toBeTruthy();
    expect(within(row).getByText("Appeal")).toBeTruthy();
  });

  it("separates borrowed from wildcard and says what is not checked", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const section = screen.getByRole("region", { name: "队伍成员关系" });
    // One paragraph carries both, so assert on its text rather than hunting
    // for two separate elements.
    expect(section.textContent).toMatch(/外援[\s\S]*不校验/);
    expect(section.textContent).toMatch(/外卡[\s\S]*不影响上场资格/);
  });

  it("warns that edits are not yet visible on the public pages", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    // Until the read path is switched over, the roster and lineup pages still
    // read the old snapshot. Without saying so, an edit that "did nothing"
    // reads as a broken save.
    expect(screen.getByText(/名单页与排阵页/)).toBeTruthy();
  });

  it("is a 404 for an unknown player", async () => {
    vi.mocked(getPlayer).mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
