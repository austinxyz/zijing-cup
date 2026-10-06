import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, adminWrite: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite } from "@/lib/admin";
import { revalidatePath } from "next/cache";

import { createMatch, deleteMatch } from "./actions";

afterEach(() => vi.clearAllMocks());

const INPUT = {
  our_team_code: "UCSD-ZJU",
  opponent_team_code: "THU-MIT",
  match_date: "2026-09-28",
  round_label: "小组赛第2轮",
  source_lineup_id: null,
  lines: {
    D1: { our: ["p1", "p2"], opp: [11, null], outcome: "win" as const, note: "抢七" },
  },
};

describe("createMatch", () => {
  it("POSTs scoped to the competition and revalidates the matches segment", async () => {
    vi.mocked(adminWrite).mockResolvedValue({ id: 5 });
    await createMatch("2026", "silver", INPUT);
    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/seasons/2026/divisions/silver/matches",
      INPUT,
      { season: "2026", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/2026/silver/matches", "layout");
  });

  it("trims round_label at the entry point", async () => {
    vi.mocked(adminWrite).mockResolvedValue({ id: 5 });
    await createMatch("2026", "silver", { ...INPUT, round_label: "  第3轮  " });
    const body = vi.mocked(adminWrite).mock.calls[0][2] as { round_label: string };
    expect(body.round_label).toBe("第3轮");
  });
});

describe("deleteMatch", () => {
  it("DELETEs scoped and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(null);
    await deleteMatch("2026", "silver", 7);
    expect(adminWrite).toHaveBeenCalledWith(
      "DELETE",
      "/api/seasons/2026/divisions/silver/matches/7",
      undefined,
      { season: "2026", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/2026/silver/matches", "layout");
  });
});
