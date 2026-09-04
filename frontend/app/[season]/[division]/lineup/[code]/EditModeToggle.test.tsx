import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { EditModeToggle } from "./EditModeToggle";

describe("EditModeToggle (in-place admin unlock)", () => {
  it("offers an 编辑模式 toggle that opens a password field when signed out", () => {
    render(<EditModeToggle signedIn={false} />);
    const toggle = screen.getByRole("button", { name: /编辑模式/ });
    fireEvent.click(toggle);
    // a password field + an unlock button, staying on the page
    expect(screen.getByLabelText("管理员口令")).toBeTruthy();
    expect(screen.getByRole("button", { name: /解锁/ })).toBeTruthy();
  });

  it("renders the same failure feedback the login page uses", () => {
    render(<EditModeToggle signedIn={false} error="bad-password" remaining={3} />);
    // matches LoginForm's wording
    expect(screen.getByText(/口令不对。还可以试 3 次/)).toBeTruthy();
  });

  it("shows an unlocked state with a logout control when signed in", () => {
    render(<EditModeToggle signedIn={true} />);
    expect(screen.getByText(/已解锁编辑/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /登出/ })).toBeTruthy();
    // no password prompt when already unlocked
    expect(screen.queryByLabelText("管理员口令")).toBeNull();
  });
});
