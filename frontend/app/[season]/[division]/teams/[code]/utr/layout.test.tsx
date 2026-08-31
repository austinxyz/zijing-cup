import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isSignedIn } from "@/lib/admin";
import { redirect } from "next/navigation";
import UtrLayout from "./layout";

vi.mock("@/lib/admin", () => ({ isSignedIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

afterEach(() => vi.resetAllMocks());

describe("the UTR route's own login gate", () => {
  it("sends a signed-out visitor to the login page", async () => {
    // This route sits under teams/, so the gate on players/ does not reach
    // it. Without one of its own it would render an admin screen to anyone.
    vi.mocked(isSignedIn).mockResolvedValue(false);

    await expect(UtrLayout({ children: <p>x</p> })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("lets a signed-in admin through", async () => {
    vi.mocked(isSignedIn).mockResolvedValue(true);

    const { container } = render(await UtrLayout({ children: <p>x</p> }));

    expect(container.textContent).toContain("x");
    expect(redirect).not.toHaveBeenCalled();
  });
});
