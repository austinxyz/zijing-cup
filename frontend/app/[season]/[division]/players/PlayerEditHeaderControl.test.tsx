import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

import { PlayerEditProvider } from "./PlayerEditContext";
import { PlayerEditHeaderControl } from "./PlayerEditHeaderControl";

function renderControl(canEdit: boolean) {
  return render(
    <PlayerEditProvider canEdit={canEdit}>
      <PlayerEditHeaderControl season="2026" division="silver" />
    </PlayerEditProvider>,
  );
}

describe("PlayerEditHeaderControl", () => {
  it("offers an in-place unlock when the viewer cannot edit", () => {
    renderControl(false);
    // Mirrors the team page: a 编辑模式 button that opens the password unlock.
    expect(screen.getByRole("button", { name: "编辑模式" })).toBeTruthy();
    // No view/edit toggle exists until signed in.
    expect(screen.queryByRole("button", { name: "查看模式" })).toBeNull();
  });

  it("offers a view/edit toggle when the viewer can edit", () => {
    renderControl(true);
    // Default is view mode, so the toggle reads 编辑模式 (switch INTO editing).
    expect(screen.getByRole("button", { name: "编辑模式" })).toBeTruthy();
  });
});
