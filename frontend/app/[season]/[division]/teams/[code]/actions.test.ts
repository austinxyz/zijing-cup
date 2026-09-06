import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, adminWrite: vi.fn() };
});
vi.mock("@/lib/api", () => ({
  getPlayer: vi.fn(),
  getPlayers: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite } from "@/lib/admin";
import { getPlayer, getPlayers } from "@/lib/api";
import {
  addExistingPlayerToTeam,
  createAndAddPlayer,
  removePlayerFromTeam,
  searchPlayersForAdd,
} from "./actions";

afterEach(() => vi.clearAllMocks());

describe("addExistingPlayerToTeam", () => {
  it("POSTs a membership for this team, scoped to the competition", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);
    await addExistingPlayerToTeam("2025", "silver", 42, 7);
    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/players/7/memberships",
      { team_id: 42 },
      { season: "2025", division: "silver" },
    );
  });
});

describe("createAndAddPlayer", () => {
  it("creates the global player (gender '' -> null), then adds the membership", async () => {
    vi.mocked(adminWrite)
      .mockResolvedValueOnce({ id: 999 }) // POST /players
      .mockResolvedValueOnce(undefined); // POST memberships
    await createAndAddPlayer("2025", "silver", 42, {
      last_name: "Wang",
      first_name: "Newbie",
      gender: "",
    });
    const calls = vi.mocked(adminWrite).mock.calls;
    expect(calls[0][0]).toBe("POST");
    expect(calls[0][1]).toBe("/api/players");
    expect(calls[0][2]).toMatchObject({
      last_name: "Wang",
      first_name: "Newbie",
      gender: null,
    });
    expect(calls[1]).toEqual([
      "POST",
      "/api/players/999/memberships",
      { team_id: 42 },
      { season: "2025", division: "silver" },
    ]);
  });

  it("keeps a real gender value", async () => {
    vi.mocked(adminWrite)
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce(undefined);
    await createAndAddPlayer("2025", "silver", 42, {
      last_name: "Li",
      first_name: "Na",
      gender: "F",
    });
    expect(vi.mocked(adminWrite).mock.calls[0][2]).toMatchObject({ gender: "F" });
  });
});

describe("removePlayerFromTeam", () => {
  it("resolves this team's membership id via getPlayer, then DELETEs it", async () => {
    vi.mocked(getPlayer).mockResolvedValue({
      id: 7,
      last_name: "X",
      first_name: "Y",
      gender: "M",
      singles_utr: null,
      singles_status: null,
      doubles_utr: null,
      doubles_status: null,
      utr_profile_id: null,
      season_utrs: [],
      memberships: [
        { id: 3, team_id: 99, season_year: 2024, team_code: "OTHER", division_code: "silver", representing_school: null, is_borrowed_player: null, is_wildcard: null },
        { id: 8, team_id: 42, season_year: 2025, team_code: "PKU", division_code: "silver", representing_school: null, is_borrowed_player: null, is_wildcard: null },
      ],
    } as never);
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await removePlayerFromTeam("2025", "silver", 42, 7);

    expect(adminWrite).toHaveBeenCalledWith(
      "DELETE",
      "/api/players/7/memberships/8",
      undefined,
      { season: "2025", division: "silver" },
    );
  });

  it("throws and does not DELETE when the player has no membership on this team", async () => {
    vi.mocked(getPlayer).mockResolvedValue({
      id: 7, last_name: "X", first_name: "Y", gender: null,
      singles_utr: null, singles_status: null, doubles_utr: null, doubles_status: null,
      utr_profile_id: null, season_utrs: [],
      memberships: [
        { id: 3, team_id: 99, season_year: 2024, team_code: "OTHER", division_code: "silver", representing_school: null, is_borrowed_player: null, is_wildcard: null },
      ],
    } as never);
    await expect(removePlayerFromTeam("2025", "silver", 42, 7)).rejects.toThrow();
    expect(adminWrite).not.toHaveBeenCalled();
  });
});

describe("searchPlayersForAdd", () => {
  it("queries getPlayers and returns compact rows", async () => {
    vi.mocked(getPlayers).mockResolvedValue([
      { id: 1, last_name: "Hu", first_name: "Mitch", gender: "M", singles_utr: null, singles_status: null, doubles_utr: null, doubles_status: null, utr_profile_id: null, season_utrs: [], memberships: [] },
    ] as never);
    const rows = await searchPlayersForAdd("Hu");
    expect(getPlayers).toHaveBeenCalledWith({ query: "Hu" });
    expect(rows).toEqual([{ id: 1, last_name: "Hu", first_name: "Mitch", gender: "M" }]);
  });

  it("returns [] for a blank query without calling the backend", async () => {
    const rows = await searchPlayersForAdd("   ");
    expect(rows).toEqual([]);
    expect(getPlayers).not.toHaveBeenCalled();
  });
});
