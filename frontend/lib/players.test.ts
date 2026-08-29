// frontend/lib/players.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getPlayer, getPlayers } from "./api";

const ONE = {
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
      season_year: 2025,
      value: "6.38",
      alt_value: "6.25",
      is_unresolved: true,
      status: "verified",
      under_appeal: false,
      source: "committee_sheet",
    },
  ],
  memberships: [
    {
      id: 7,
      team_id: 3,
      team_code: "THU-UOC",
      season_year: 2025,
      division_code: "gold",
      representing_school: "清华",
      is_borrowed_player: false,
      is_wildcard: null,
    },
  ],
};

function stub(response: Record<string, unknown>) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getPlayers", () => {
  it("returns the list with both kinds of UTR and every membership", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    stub({ ok: true, status: 200, json: () => Promise.resolve([ONE]) });

    const players = await getPlayers();

    expect(players[0].singles_status).toBe("rated");
    // Both candidates survive the trip: the page has to show what the ruling
    // would be choosing between.
    expect(players[0].season_utrs[0].alt_value).toBe("6.25");
    expect(players[0].season_utrs[0].is_unresolved).toBe(true);
    expect(players[0].memberships[0].team_code).toBe("THU-UOC");
  });

  it("passes the search and filters through as query parameters", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = stub({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await getPlayers({ query: "Zong", season: 2025, teamId: 3 });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/players");
    expect(url.searchParams.get("q")).toBe("Zong");
    expect(url.searchParams.get("season")).toBe("2025");
    expect(url.searchParams.get("team_id")).toBe("3");
  });

  it("sends no empty parameters when nothing is filtered", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = stub({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await getPlayers();

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect([...url.searchParams.keys()]).toEqual([]);
  });

  it("throws on a failure rather than returning an empty list", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stub({ ok: false, status: 500 });

    // An empty list would read as "there are no players", which is a claim
    // about the roster rather than about the request.
    await expect(getPlayers()).rejects.toThrow("getPlayers failed: 500");
  });
});

describe("getPlayer", () => {
  it("returns one player", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stub({ ok: true, status: 200, json: () => Promise.resolve(ONE) });

    const player = await getPlayer(42);

    expect(player?.first_name).toBe("Qingqing");
  });

  it("returns null for an unknown id", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stub({ ok: false, status: 404 });

    await expect(getPlayer(9999)).resolves.toBeNull();
  });
});

describe("getPlayersPage", () => {
  it("reports the real total, not the size of the page it got", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stub({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Total-Count": "375" }),
      json: () => Promise.resolve([ONE]),
    });

    const { getPlayersPage } = await import("./api");
    const page = await getPlayersPage({ limit: 1 });

    // A badge that counts the rows it happened to receive is a wrong number
    // presented as a fact — 200 of 375 would read as "there are 200".
    expect(page.players).toHaveLength(1);
    expect(page.total).toBe(375);
    expect(page.truncated).toBe(true);
  });

  it("is not truncated when the page holds everything", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stub({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Total-Count": "1" }),
      json: () => Promise.resolve([ONE]),
    });

    const { getPlayersPage } = await import("./api");
    const page = await getPlayersPage();

    expect(page.truncated).toBe(false);
  });

  it("asks for only the contested players when told to", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = stub({
      ok: true,
      status: 200,
      headers: new Headers({ "X-Total-Count": "17" }),
      json: () => Promise.resolve([]),
    });

    const { getPlayersPage } = await import("./api");
    await getPlayersPage({ unresolved: true });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("unresolved")).toBe("true");
  });
});
