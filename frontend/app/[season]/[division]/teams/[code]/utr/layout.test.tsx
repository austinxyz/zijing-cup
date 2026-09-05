import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canEdit } from "@/lib/admin";
import { redirect } from "next/navigation";
import UtrLayout from "./layout";

vi.mock("@/lib/admin", () => ({ canEdit: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

afterEach(() => vi.resetAllMocks());

const params = Promise.resolve({ season: "2026", division: "silver" });

describe("the UTR route's own competition gate", () => {
  it("sends a viewer without edit rights for this competition to its team list", async () => {
    // This route sits under teams/, so the gate on players/ does not reach it.
    // A viewer who has not unlocked THIS competition is sent to its team list
    // (where the in-place unlock lives), not the super-only /login.
    vi.mocked(canEdit).mockResolvedValue(false);

    await expect(UtrLayout({ children: <p>x</p>, params })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/2026/silver/teams");
  });

  it("lets a competition admin through", async () => {
    vi.mocked(canEdit).mockResolvedValue(true);

    const { container } = render(await UtrLayout({ children: <p>x</p>, params }));

    expect(container.textContent).toContain("x");
    expect(redirect).not.toHaveBeenCalled();
  });
});
