import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, adminWrite: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite } from "@/lib/admin";
import { revalidatePath } from "next/cache";

import { deleteComparison, saveComparison, setLineNote } from "./actions";

afterEach(() => vi.clearAllMocks());

describe("saveComparison", () => {
  it("POSTs the references scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await saveComparison("2026", "gold", {
      name: "打 THU 预案",
      team_a_code: "UCSD-ZJU-UCB",
      lineup_a_id: 11,
      team_b_code: "THU-MIT",
      lineup_b_id: 22,
    });

    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/seasons/2026/divisions/gold/comparisons",
      {
        name: "打 THU 预案",
        team_a_code: "UCSD-ZJU-UCB",
        lineup_a_id: 11,
        team_b_code: "THU-MIT",
        lineup_b_id: 22,
      },
      { season: "2026", division: "gold" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("trims the name before sending", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await saveComparison("2026", "gold", {
      name: "  空格  ",
      team_a_code: "A",
      lineup_a_id: 1,
      team_b_code: "B",
      lineup_b_id: 2,
    });

    expect(vi.mocked(adminWrite).mock.calls[0][2]).toMatchObject({ name: "空格" });
  });
});

describe("setLineNote", () => {
  it("trims the text but keeps empty as a clear", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await setLineNote("2026", "gold", 7, "D1", "   ");

    expect(vi.mocked(adminWrite).mock.calls[0][2]).toEqual({
      line_code: "D1",
      text: "",
    });
  });

  it("POSTs the line note scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await setLineNote("2026", "gold", 7, "D1", "我方略强");

    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/seasons/2026/divisions/gold/comparisons/7/line-note",
      { line_code: "D1", text: "我方略强" },
      { season: "2026", division: "gold" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });
});

describe("deleteComparison", () => {
  it("DELETEs the comparison scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await deleteComparison("2026", "gold", 7);

    expect(adminWrite).toHaveBeenCalledWith(
      "DELETE",
      "/api/seasons/2026/divisions/gold/comparisons/7",
      undefined,
      { season: "2026", division: "gold" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });
});
