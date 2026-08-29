// frontend/lib/lineups.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTeamLineups } from "./api";

const PAYLOAD = {
  candidates: [
    {
      total: "55.92",
      buffer_spent: "0.49",
      lines: {
        D1: [
          { key: "1", last_name: "陈", first_name: "嘉禾", gender: "M", match_utr: "6.80" },
          { key: "2", last_name: "徐", first_name: "鹏远", gender: "M", match_utr: "6.41" },
        ],
      },
      line_totals: { D1: { total: "13.21", cap: "13.00", over: "0.21" } },
    },
  ],
  ceiling: "55.92",
  squads_at_ceiling: 1,
  squads_at_ceiling_exact: true,
  rules_ceiling: "56.00",
  infeasible_line: null,
  placements: {},
  truncated: false,
  borrowed_players_checked: false,
  invalid_locks: [],
  roster: [],
};

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("getTeamLineups", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the candidates, both ceilings and the three state flags", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve(PAYLOAD) });

    const result = await getTeamLineups(2026, "silver", "PKU");

    expect(result?.ceiling).toBe("55.92");
    expect(result?.rules_ceiling).toBe("56.00");
    expect(result?.squads_at_ceiling).toBe(1);
    // The three states that must never be read off an empty list.
    expect(result?.infeasible_line).toBeNull();
    expect(result?.truncated).toBe(false);
    expect(result?.borrowed_players_checked).toBe(false);
    expect(result?.candidates[0].lines.D1[0].gender).toBe("M");
  });

  it("encodes locks and exclusions into the query the backend expects", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubEnv("BACKEND_SECRET", "s3cr3t");
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAYLOAD),
    });

    await getTeamLineups(2026, "silver", "PKU", {
      locks: { D1: ["1", "2"], WD: ["7", "8"] },
      excluded: ["9"],
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe(
      "/api/seasons/2026/divisions/silver/teams/PKU/lineups",
    );
    expect(url.searchParams.getAll("lock")).toEqual(["D1:1,2", "WD:7,8"]);
    expect(url.searchParams.getAll("exclude")).toEqual(["9"]);
  });

  it("sends no lock or exclude parameter when nothing is constrained", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      json: () => Promise.resolve(PAYLOAD),
    });

    await getTeamLineups(2026, "silver", "PKU");

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.has("lock")).toBe(false);
    expect(url.searchParams.has("exclude")).toBe(false);
  });

  it("returns null for an unknown team rather than an empty result", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stubFetch({ ok: false, status: 404 });

    // null is "no such team"; a result with no candidates is "this team has
    // no legal lineup". Collapsing them would show an empty search for a URL
    // that names nothing.
    await expect(getTeamLineups(2026, "silver", "NOPE")).resolves.toBeNull();
  });

  it("throws on any other failure", async () => {
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    stubFetch({ ok: false, status: 500 });

    await expect(getTeamLineups(2026, "silver", "PKU")).rejects.toThrow(
      "getTeamLineups failed: 500",
    );
  });
});
