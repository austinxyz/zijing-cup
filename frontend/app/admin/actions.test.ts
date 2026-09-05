import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin")>();
  return { ...actual, isSuper: vi.fn(), adminWrite: vi.fn() };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { adminWrite, isSuper, NotAuthorizedForCompetition } from "@/lib/admin";
import { setCompetitionPassword } from "./actions";

afterEach(() => vi.clearAllMocks());

describe("setCompetitionPassword (super only)", () => {
  it("refuses and does not write when the session is not super", async () => {
    vi.mocked(isSuper).mockResolvedValue(false);
    await expect(
      setCompetitionPassword("2026", "silver", "new-pw"),
    ).rejects.toBeInstanceOf(NotAuthorizedForCompetition);
    expect(adminWrite).not.toHaveBeenCalled();
  });

  it("hashes on the Next side and PUTs the hash for super", async () => {
    vi.mocked(isSuper).mockResolvedValue(true);
    vi.mocked(adminWrite).mockResolvedValue(undefined);
    await setCompetitionPassword("2026", "gold", "gold-pw");
    expect(adminWrite).toHaveBeenCalledTimes(1);
    const [method, path, body, scope] = vi.mocked(adminWrite).mock.calls[0];
    expect(method).toBe("PUT");
    expect(path).toBe("/api/seasons/2026/divisions/gold/admin-credential");
    // A hash, not the plaintext — salt:hash and no "gold-pw" in it.
    const hash = (body as { password_hash: string }).password_hash;
    expect(hash).toContain(":");
    expect(hash).not.toContain("gold-pw");
    expect(scope).toBe("super-only");
  });

  it("refuses an empty password", async () => {
    vi.mocked(isSuper).mockResolvedValue(true);
    await expect(setCompetitionPassword("2026", "silver", "   ")).rejects.toThrow();
    expect(adminWrite).not.toHaveBeenCalled();
  });
});
