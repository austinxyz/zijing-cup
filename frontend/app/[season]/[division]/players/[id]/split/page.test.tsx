import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayer, type Player } from "@/lib/api";
import Page from "./page";
import { SplitForm } from "./SplitForm";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getPlayer: vi.fn() };
});

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn(),
}));

vi.mock("./actions", () => ({ splitPlayer: vi.fn() }));

const PLAYER: Player = {
  id: 118,
  last_name: "Huang",
  first_name: "Andrew",
  gender: "M",
  singles_utr: null,
  singles_status: null,
  doubles_utr: null,
  doubles_status: null,
  utr_profile_id: "2841902",
  season_utrs: [
    {
      season_year: 2026,
      value: "6.80",
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
      value: "6.73",
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
      id: 11,
      team_id: 1,
      team_code: "HUST-NTU",
      season_year: 2025,
      division_code: "gold",
      representing_school: "华中科大",
      is_borrowed_player: null,
      is_wildcard: null,
    },
    {
      id: 12,
      team_id: 2,
      team_code: "NTU-NCTU",
      season_year: 2025,
      division_code: "silver",
      representing_school: "台大",
      is_borrowed_player: null,
      is_wildcard: null,
    },
  ],
};

function renderPage() {
  return Page({
    params: Promise.resolve({ season: "2026", division: "silver", id: "118" }),
  });
}

afterEach(() => vi.clearAllMocks());

describe("the split page", () => {
  it("warns that the split cannot be undone", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toMatch(/拆分不可撤销/);
    expect(warning.textContent).toMatch(/没有操作历史/);
  });

  it("styles the irreversible warning differently from an unresolved notice", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const warning = screen.getByRole("alert");
    // danger, not the warning tier used for 未裁决: one says "check this", the
    // other says "this cannot be taken back", and the same colour would flatten
    // them into the same thing.
    expect(warning.className).toMatch(/danger/);
    expect(warning.className).not.toMatch(/warning/);
  });

  it("offers every membership and season UTR as its own row", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const chooser = screen.getByRole("region", { name: "把哪些记录分出去" });
    // One checkbox per record, memberships and season values alike: a split is
    // decided row by row, because no rule can tell which of two people a row
    // belonged to.
    expect(within(chooser).getByLabelText("成员关系 2025 HUST-NTU")).toBeTruthy();
    expect(within(chooser).getByLabelText("成员关系 2025 NTU-NCTU")).toBeTruthy();
    expect(within(chooser).getByLabelText("赛季 UTR 2025")).toBeTruthy();
    expect(within(chooser).getByLabelText("赛季 UTR 2026")).toBeTruthy();
  });

  it("shows the UTR link as the evidence a split rests on", async () => {
    vi.mocked(getPlayer).mockResolvedValue(PLAYER);

    render(await renderPage());

    const chooser = screen.getByRole("region", { name: "把哪些记录分出去" });
    // The only thing that can settle whether two records are one human — and
    // the library currently has none of them, which is why it has to be shown.
    expect(within(chooser).getAllByText(/2841902|未填/).length).toBeGreaterThan(0);
  });

  it("shows both sides of the outcome before anything happens", () => {
    render(
      <SplitForm
        player={PLAYER}
        selectedMemberships={[11]}
        selectedSeasons={[2025]}
        season="2026"
        division="silver"
      />,
    );

    const staying = screen.getByRole("region", { name: "留在原记录" });
    const leaving = screen.getByRole("region", { name: "分出为新队员" });

    // Both columns, computed from the same selection: the mistake a split
    // makes is "this row went the wrong way", and it is only visible if each
    // side says what it ends up with.
    expect(staying.textContent).toMatch(/NTU-NCTU/);
    expect(staying.textContent).toMatch(/2026 赛季 UTR/);
    expect(leaving.textContent).toMatch(/HUST-NTU/);
    expect(leaving.textContent).toMatch(/2025 赛季 UTR/);
    // And each side shows only its own: the point is to catch a row that went
    // the wrong way.
    expect(staying.textContent).not.toMatch(/HUST-NTU/);
    expect(leaving.textContent).not.toMatch(/NTU-NCTU/);
  });

  it("keeps everything on the original when nothing is selected", () => {
    render(
      <SplitForm
        player={PLAYER}
        selectedMemberships={[]}
        selectedSeasons={[]}
        season="2026"
        division="silver"
      />,
    );

    const leaving = screen.getByRole("region", { name: "分出为新队员" });
    expect(leaving.textContent).toMatch(/没有选中任何记录/);
  });

  it("is a 404 for a player who does not exist", async () => {
    vi.mocked(getPlayer).mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
