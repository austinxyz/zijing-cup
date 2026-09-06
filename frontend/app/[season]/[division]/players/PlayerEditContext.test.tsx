import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  PlayerEditProvider,
  EditOnly,
  usePlayerEdit,
} from "./PlayerEditContext";

function ModeProbe() {
  const { canEdit, editing, setEditing } = usePlayerEdit();
  return (
    <div>
      <span data-testid="state">{`${canEdit}:${editing}`}</span>
      <button onClick={() => setEditing(!editing)}>切换</button>
      <EditOnly>
        <span>写控件</span>
      </EditOnly>
    </div>
  );
}

describe("PlayerEditContext / EditOnly", () => {
  it("defaults to view mode even for an editor (merge/split are irreversible)", () => {
    render(
      <PlayerEditProvider canEdit>
        <ModeProbe />
      </PlayerEditProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("true:false");
    // View mode: the write control is hidden.
    expect(screen.queryByText("写控件")).toBeNull();
  });

  it("shows write controls only after switching to edit mode", () => {
    render(
      <PlayerEditProvider canEdit>
        <ModeProbe />
      </PlayerEditProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "切换" }));
    expect(screen.getByText("写控件")).toBeTruthy();
  });

  it("never shows write controls when the viewer cannot edit", () => {
    render(
      <PlayerEditProvider canEdit={false}>
        <ModeProbe />
      </PlayerEditProvider>,
    );
    // Even if editing were toggled, canEdit=false must keep writes hidden.
    fireEvent.click(screen.getByRole("button", { name: "切换" }));
    expect(screen.queryByText("写控件")).toBeNull();
  });
});
