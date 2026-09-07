// frontend/lib/api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDivisionTeams,
  getHealth,
  getPlayerNotes,
  getPlayerNotesBatch,
  getPlayers,
  getPlayersPage,
  getTeamLineups,
  getTeamRoster,
} from "./api";

describe("getHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the parsed health payload on success", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", db: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getHealth();

    expect(result).toEqual({ status: "ok", db: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/health",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("throws when the backend responds with a non-2xx status", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getHealth()).rejects.toThrow("getHealth failed: 500");
  });

  it("throws a clear error when BACKEND_URL is not configured", async () => {
    vi.stubEnv("BACKEND_URL", "");

    await expect(getHealth()).rejects.toThrow("BACKEND_URL is not configured");
  });
});

describe("getDivisionTeams", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the division's teams with their head counts", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const payload = [
      {
        code: "TEAM-A",
        display_name: "甲队",
        player_count: 3,
        men_count: 2,
        women_count: 1,
        unknown_gender_count: 0,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getDivisionTeams(2025, "silver");

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/seasons/2025/divisions/silver/teams",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("returns null for an unknown season or division", async () => {
    // A 404 here means the URL names nothing, which the page renders as
    // not-found. An empty array would claim the division exists and has no
    // teams — a different and false statement.
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(getDivisionTeams(1899, "silver")).resolves.toBeNull();
  });

  it("throws on any other failure", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    await expect(getDivisionTeams(2025, "silver")).rejects.toThrow("500");
  });
});

describe("getTeamRoster", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the team and its players", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const payload = {
      team: {
        code: "TEAM-A",
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
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTeamRoster(2025, "silver", "TEAM-A");

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/seasons/2025/divisions/silver/teams/TEAM-A/roster",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("returns null for an unknown team", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(getTeamRoster(2025, "silver", "GHOST")).resolves.toBeNull();
  });

  it("encodes the team code so a slash cannot escape the path", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);

    await getTeamRoster(2025, "silver", "A/B");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/seasons/2025/divisions/silver/teams/A%2FB/roster",
      expect.anything(),
    );
  });
});

describe("getTeamLineups pin encoding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("encodes pins as pin=LINE:key alongside lock and exclude", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getTeamLineups(2026, "silver", "ZJU-USC", {
      locks: { D1: ["p1", "p2"] },
      pins: { MD: "p9" },
      excluded: ["p3"],
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("pin=MD%3Ap9");
    expect(url).toContain("lock=D1%3Ap1%2Cp2");
    expect(url).toContain("exclude=p3");
  });
});

describe("getPlayers / getPlayersPage filters", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubFetch(body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "0" },
      json: () => Promise.resolve(body),
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("puts gender, team and year into the query string", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = stubFetch([]);

    await getPlayers({ gender: "F", team: "北大", year: 2025 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("gender=F");
    expect(url).toContain(`team=${encodeURIComponent("北大")}`);
    expect(url).toContain("year=2025");
  });

  it("omits the new params when not given", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = stubFetch([]);

    await getPlayers({ query: "hu" });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain("gender=");
    expect(url).not.toContain("team=");
    expect(url).not.toContain("year=");
  });

  it("getPlayersPage forwards the same filters", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = stubFetch([]);

    await getPlayersPage({ gender: "M", team: "PKU", year: 2026, limit: 1 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("gender=M");
    expect(url).toContain("team=PKU");
    expect(url).toContain("year=2026");
  });
});

describe("getPlayerNotes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests the player's notes endpoint and returns the parsed list", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const payload = [
      { id: 2, category: "weakness", body: "反手薄弱", created_at: "2026-09-06T10:00:00Z" },
      { id: 1, category: "strength", body: "正手很重", created_at: "2026-09-06T09:00:00Z" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const notes = await getPlayerNotes(42);

    expect(notes).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/players/42/notes",
      expect.objectContaining({
        headers: { "X-Backend-Secret": "s3cr3t" },
      }),
    );
  });

  it("degrades to an empty list when the endpoint is not ok (migration lag)", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    // A missing player_notes table (remote migration not yet applied) must not
    // throw and take the player detail page down — notes are an enhancement.
    await expect(getPlayerNotes(42)).resolves.toEqual([]);
  });

  it("degrades to an empty list when fetch rejects", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(getPlayerNotes(42)).resolves.toEqual([]);
  });
});

describe("getPlayerNotesBatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("requests the batch endpoint and returns the grouped map", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const payload = {
      "7": [{ id: 1, category: "strength", body: "正手重", created_at: "2026-09-06T09:00:00Z" }],
      "9": [{ id: 2, category: "weakness", body: "反手弱", created_at: "2026-09-06T10:00:00Z" }],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const map = await getPlayerNotesBatch([7, 9]);

    expect(map).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://backend.test/api/players/notes?ids=7%2C9",
      expect.objectContaining({ headers: { "X-Backend-Secret": "s3cr3t" } }),
    );
  });

  it("does not fetch for an empty id list", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPlayerNotesBatch([])).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("degrades to an empty map when the endpoint is not ok", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(getPlayerNotesBatch([7])).resolves.toEqual({});
  });

  it("degrades to an empty map when fetch rejects", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(getPlayerNotesBatch([7])).resolves.toEqual({});
  });
});
