import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, adminWrite: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite } from "@/lib/admin";
import { revalidatePath } from "next/cache";

import { addPlayerNote, deletePlayerNote } from "./actions";

afterEach(() => vi.clearAllMocks());

describe("addPlayerNote", () => {
  it("POSTs the note scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await addPlayerNote("2025", "silver", 7, "strength", "正手很重");

    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/players/7/notes",
      { category: "strength", body: "正手很重" },
      { season: "2025", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("trims the body before sending", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await addPlayerNote("2025", "silver", 7, "other", "  有空格  ");

    expect(vi.mocked(adminWrite).mock.calls[0][2]).toEqual({
      category: "other",
      body: "有空格",
    });
  });

  it("does not write when the trimmed body is empty", async () => {
    await addPlayerNote("2025", "silver", 7, "weakness", "   ");

    expect(adminWrite).not.toHaveBeenCalled();
  });
});

describe("deletePlayerNote", () => {
  it("DELETEs the note scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(null);

    await deletePlayerNote("2025", "silver", 7, 99);

    expect(adminWrite).toHaveBeenCalledWith(
      "DELETE",
      "/api/players/7/notes/99",
      undefined,
      { season: "2025", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });
});
