import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayer, getPlayers, type Player } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPlayer: vi.fn(), getPlayers: vi.fn(async () => []) };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("./actions", () => ({ mergePlayers: vi.fn() }));

function make(id: number, first: string, value: string, team: string): Player {
  return {
    id,
    last_name: "Huang",
    first_name: first,
    gender: "M",
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
    utr_profile_id: null,
    season_utrs: [
      {
        season_year: 2025,
        value,
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
        id: id * 10,
        team_id: id,
        team_code: team,
        season_year: 2025,
        division_code: "gold",
        representing_school: null,
        is_borrowed_player: null,
        is_wildcard: null,
      },
    ],
  };
}

const KEEP = make(1, "Andrew", "6.25", "HUST-NTU");
const OTHER = make(2, "Andrew", "6.38", "NTU-NCTU");
const SAME_VALUE = make(3, "Andrew", "6.25", "PKU");

function renderPage(query: Record<string, string> = {}) {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver", id: "1" }),
    searchParams: Promise.resolve(query),
  });
}

afterEach(() => vi.clearAllMocks());

describe("the merge page", () => {
  it("warns that the merge cannot be undone", async () => {
    vi.mocked(getPlayer).mockResolvedValue(KEEP);

    render(await renderPage());

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toMatch(/不可撤销/);
    expect(warning.className).toMatch(/danger/);
  });

  it("says which record survives and which one disappears", async () => {
    vi.mocked(getPlayer).mockImplementation(async (id) =>
      String(id) === "1" ? KEEP : OTHER,
    );

    render(await renderPage({ with: "2" }));

    const summary = screen.getByRole("region", { name: "合并结果" });
    // Getting these two backwards deletes the wrong person, and there is no
    // undo — so the page has to name them rather than leave it to the URL.
    expect(summary.textContent).toMatch(/#1/);
    expect(summary.textContent).toMatch(/#2/);
    expect(summary.textContent).toMatch(/删除/);
  });

  it("shows the union of what the survivor will hold", async () => {
    vi.mocked(getPlayer).mockImplementation(async (id) =>
      String(id) === "1" ? KEEP : OTHER,
    );

    render(await renderPage({ with: "2" }));

    const summary = screen.getByRole("region", { name: "合并结果" });
    expect(summary.textContent).toMatch(/HUST-NTU/);
    expect(summary.textContent).toMatch(/NTU-NCTU/);
  });

  it("warns before the fact that a season will end up contested", async () => {
    vi.mocked(getPlayer).mockImplementation(async (id) =>
      String(id) === "1" ? KEEP : OTHER,
    );

    render(await renderPage({ with: "2" }));

    const conflicts = screen.getByRole("region", { name: "将产生的冲突" });
    // Both candidates and which one will be read: the merge is allowed to
    // create this, but nobody should discover it afterwards.
    expect(conflicts.textContent).toMatch(/2025/);
    expect(conflicts.textContent).toMatch(/6\.25/);
    expect(conflicts.textContent).toMatch(/6\.38/);
    expect(conflicts.textContent).toMatch(/较大/);
  });

  it("says there is no conflict when both sides agree", async () => {
    vi.mocked(getPlayer).mockImplementation(async (id) =>
      String(id) === "1" ? KEEP : SAME_VALUE,
    );

    render(await renderPage({ with: "3" }));

    const conflicts = screen.getByRole("region", { name: "将产生的冲突" });
    expect(conflicts.textContent).toMatch(/不会产生冲突/);
  });

  it("asks for the other record before it can preview anything", async () => {
    vi.mocked(getPlayer).mockResolvedValue(KEEP);

    render(await renderPage());

    expect(screen.getByLabelText("要并入的队员")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "合并结果" })).toBeNull();
  });

  it("refuses to preview merging a record into itself", async () => {
    vi.mocked(getPlayer).mockResolvedValue(KEEP);

    render(await renderPage({ with: "1" }));

    expect(screen.getByText(/不能和自己合并/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "合并结果" })).toBeNull();
  });
});
