import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayersPage, type Player } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPlayersPage: vi.fn() };
});

vi.mock("./actions", () => ({ ruleOnSeason: vi.fn() }));

function contested(id: number, first: string, high: string, low: string): Player {
  return {
    id,
    last_name: "Zong",
    first_name: first,
    gender: "F",
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
    utr_profile_id: null,
    season_utrs: [
      {
        season_year: 2025,
        value: high,
        alt_value: low,
        is_unresolved: true,
        value_division: "gold",
        alt_value_division: "silver",
        status: "verified",
        under_appeal: false,
        source: "committee_sheet",
      },
    ],
    memberships: [
      {
        id: id * 10,
        team_id: id,
        team_code: "THU-UOC",
        season_year: 2025,
        division_code: "gold",
        representing_school: null,
        is_borrowed_player: null,
        is_wildcard: null,
      },
      {
        id: id * 10 + 1,
        team_id: id + 100,
        team_code: "THU-I",
        season_year: 2025,
        division_code: "silver",
        representing_school: null,
        is_borrowed_player: null,
        is_wildcard: null,
      },
    ],
  };
}

const QUEUE = [
  contested(1, "Qingqing", "6.38", "6.25"),
  contested(2, "Rayne", "7.84", "7.82"),
];

function renderPage() {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver" }),
  });
}

afterEach(() => vi.clearAllMocks());

describe("the unresolved queue", () => {
  it("shows both candidates and which one is being used", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: QUEUE,
      total: 2,
      truncated: false,
    });

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Qingqing/ });
    // Both numbers appear more than once on the row — in the two sheet columns
    // and again on the buttons that would pick them — so assert on the row's
    // text rather than on a single element.
    expect(row.textContent).toMatch(/6\.38/);
    expect(row.textContent).toMatch(/6\.25/);
    // The rule has to be visible per row, not only in the banner: this column
    // is what says the current answer is a conservative stand-in.
    expect(within(row).getByLabelText("当前采用").textContent).toMatch(/6\.38/);
  });

  it("labels each candidate by where it came from, not by which is bigger", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [QUEUE[0]],
      total: 1,
      truncated: false,
    });

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Qingqing/ });
    // QUEUE[0] has the LARGER value in gold. A table that assumed "larger =
    // silver" would print the two sheets the wrong way round, and the whole
    // point of the row is deciding which sheet to believe.
    expect(within(row).getByLabelText("金组总表").textContent).toMatch(/6\.38/);
    expect(within(row).getByLabelText("银组总表").textContent).toMatch(/6\.25/);
  });

  it("says a candidate's origin is unknown rather than guessing one", async () => {
    const merged = structuredClone(QUEUE[0]);
    merged.season_utrs[0].value_division = null;
    merged.season_utrs[0].alt_value_division = null;
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [merged],
      total: 1,
      truncated: false,
    });

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Qingqing/ });
    // A conflict created by merging two hand-made records has no sheet behind
    // either number.
    expect(row.textContent).toMatch(/来源未知/);
  });

  it("names the teams each candidate came from", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: QUEUE,
      total: 2,
      truncated: false,
    });

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Qingqing/ });
    // Ruling means deciding which sheet to believe; without the team names
    // there is nothing to decide on.
    expect(row.textContent).toMatch(/THU-UOC/);
    expect(row.textContent).toMatch(/THU-I/);
  });

  it("offers a third value, not just the two candidates", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [QUEUE[0]],
      total: 1,
      truncated: false,
    });

    render(await renderPage());

    const row = screen.getByRole("row", { name: /Qingqing/ });
    expect(within(row).getByRole("button", { name: "取 6.38" })).toBeTruthy();
    expect(within(row).getByRole("button", { name: "取 6.25" })).toBeTruthy();
    // The committee can issue a correction after both sheets were frozen, and
    // forcing a choice between two wrong numbers would launder the error.
    expect(within(row).getByLabelText("填别的")).toBeTruthy();
  });

  it("explains that the current answers are conservative, not confirmed", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: QUEUE,
      total: 2,
      truncated: false,
    });

    render(await renderPage());

    const banner = screen.getByRole("region", { name: "取值说明" });
    expect(banner.textContent).toMatch(/较大值/);
    expect(banner.textContent).toMatch(/保守/);
  });

  it("keeps the bulk action from looking like the default", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: QUEUE,
      total: 2,
      truncated: false,
    });

    render(await renderPage());

    const bulk = screen.getByRole("button", { name: /全部按较大值确认/ });
    const single = screen.getAllByRole("button", { name: /^取 / })[0];
    // Confirming 17 rows at once turns a conservative estimate into a stated
    // fact. It is allowed, but it must not be the thing the eye lands on.
    expect(bulk.className).not.toMatch(/bg-primary/);
    expect(single.className).not.toMatch(/bg-primary/);
  });

  it("says so when the queue is empty rather than showing a bare table", async () => {
    vi.mocked(getPlayersPage).mockResolvedValue({
      players: [],
      total: 0,
      truncated: false,
    });

    render(await renderPage());

    expect(screen.getByText(/没有待裁决/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
