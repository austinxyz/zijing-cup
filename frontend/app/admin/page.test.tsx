import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", () => ({ isSuper: vi.fn() }));
vi.mock("./actions", () => ({ setCompetitionPassword: vi.fn() }));

import { isSuper } from "@/lib/admin";
import AdminPage from "./page";

afterEach(() => vi.clearAllMocks());

describe("super password console", () => {
  it("renders the form for the super admin", async () => {
    vi.mocked(isSuper).mockResolvedValue(true);
    render(await AdminPage());
    expect(screen.getByLabelText("新密码")).toBeTruthy();
    expect(screen.getByRole("button", { name: /设置密码/ })).toBeTruthy();
  });

  it("shows only a notice to a non-super visitor — no form", async () => {
    vi.mocked(isSuper).mockResolvedValue(false);
    render(await AdminPage());
    expect(screen.queryByLabelText("新密码")).toBeNull();
    expect(screen.getByText(/请用 super 密码登录后再来/)).toBeTruthy();
  });
});
