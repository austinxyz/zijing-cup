import { describe, expect, it, vi, afterEach } from "vitest";

import { getSeasons } from "@/lib/api";
import Page from "./page";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getSeasons: vi.fn() };
});

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

afterEach(() => vi.clearAllMocks());

describe("Home", () => {
  it("sends the visitor to the newest season's silver rules", async () => {
    // Silver is the larger division by team count, so it is the more useful
    // landing page; the switcher is one click away.
    vi.mocked(getSeasons).mockResolvedValue([
      {
        year: 2026,
        edition_name: "第十一届",
        divisions: [
          { code: "gold", display_name: "金组" },
          { code: "silver", display_name: "银组" },
        ],
      },
      {
        year: 2025,
        edition_name: "第十届",
        divisions: [{ code: "silver", display_name: "银组" }],
      },
    ]);

    await Page();

    expect(redirect).toHaveBeenCalledWith("/2026/silver/rules");
  });

  it("falls back to the newest season's first division when silver is absent", async () => {
    vi.mocked(getSeasons).mockResolvedValue([
      {
        year: 2026,
        edition_name: "第十一届",
        divisions: [{ code: "gold", display_name: "金组" }],
      },
    ]);

    await Page();

    expect(redirect).toHaveBeenCalledWith("/2026/gold/rules");
  });
});
