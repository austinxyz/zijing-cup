import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, adminWrite: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite } from "@/lib/admin";
import { revalidatePath } from "next/cache";

import { addLineupComment, deleteLineupComment } from "./actions";

afterEach(() => vi.clearAllMocks());

describe("addLineupComment", () => {
  it("POSTs the trimmed body scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);

    await addLineupComment("2025", "silver", "THU", 3, "打 THU 用这套");

    expect(adminWrite).toHaveBeenCalledWith(
      "POST",
      "/api/seasons/2025/divisions/silver/teams/THU/saved-lineups/3/comments",
      { body: "打 THU 用这套" },
      { season: "2025", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("trims whitespace before sending", async () => {
    vi.mocked(adminWrite).mockResolvedValue(undefined);
    await addLineupComment("2025", "silver", "THU", 3, "  有空格  ");
    expect(vi.mocked(adminWrite).mock.calls[0][2]).toEqual({ body: "有空格" });
  });

  it("is a no-op for blank body — never reaches the backend", async () => {
    await addLineupComment("2025", "silver", "THU", 3, "   ");
    expect(adminWrite).not.toHaveBeenCalled();
  });
});

describe("deleteLineupComment", () => {
  it("DELETEs the comment scoped to the competition and revalidates", async () => {
    vi.mocked(adminWrite).mockResolvedValue(null);

    await deleteLineupComment("2025", "silver", "THU", 3, 99);

    expect(adminWrite).toHaveBeenCalledWith(
      "DELETE",
      "/api/seasons/2025/divisions/silver/teams/THU/saved-lineups/3/comments/99",
      undefined,
      { season: "2025", division: "silver" },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });
});
