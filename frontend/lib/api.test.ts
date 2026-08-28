// frontend/lib/api.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDivisionTeams, getHealth, getTeamRoster } from "./api";

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
