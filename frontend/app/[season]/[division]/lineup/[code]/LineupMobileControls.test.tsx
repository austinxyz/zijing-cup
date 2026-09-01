import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupPlayer } from "@/lib/api";
import { LineupControls } from "./LineupControls";
import { LineupMobileControls } from "./LineupMobileControls";

function player(key: string, last: string, first: string): LineupPlayer {
  return {
    key,
    last_name: last,
    first_name: first,
    gender: "M",
    match_utr: "6.50",
    origin: "frozen",
    origin_year: 2025,
    is_unresolved: false,
  };
}

const ROSTER = [player("k1", "陈", "嘉禾"), player("k2", "吴", "普强")];

function frame(overrides = {}) {
  return render(
    <LineupMobileControls
      controls={<form role="search" aria-label="锁定与排除"><button type="submit">搜索阵容</button></form>}
      locks={{ D1: ["k1", "k2"] }}
      excluded={[]}
      roster={ROSTER}
      {...overrides}
    />,
  );
}

describe("LineupMobileControls", () => {
  it("shows the constraint summary by name while the drawer is closed", () => {
    frame();
    // Closed by default: no dialog, but the summary names who is locked.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/陈 嘉禾/)).toBeTruthy();
  });

  it("opens the controls in a dialog and closes again", () => {
    frame();
    fireEvent.click(screen.getByRole("button", { name: /改约束/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The controls form (with its explicit submit) is inside.
    expect(screen.getByRole("button", { name: "搜索阵容" })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the search behind an explicit submit, never auto-firing", () => {
    // Render the REAL controls, not a stub: a search on the cold free instance
    // is a full solve, so editing a constraint must not submit — only the
    // button may. Firing `change` on a real select and asserting no submit is
    // the behaviour; checking a literal `onchange` attribute would always pass
    // because React never sets one.
    const lines = [
      { code: "D1", cap: "13.00", points: 1, is_open: false } as never,
    ];
    const submitted = vi.fn((e: Event) => e.preventDefault());
    render(
      <LineupMobileControls
        controls={
          <LineupControls
            lines={lines}
            roster={ROSTER}
            locks={{}}
            excluded={[]}
            variant="drawer"
          />
        }
        locks={{}}
        excluded={[]}
        roster={ROSTER}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /改约束/ }));
    const form = screen.getByRole("search", { name: "锁定与排除" });
    form.addEventListener("submit", submitted as EventListener);

    // Change a lock select and toggle an exclusion — neither may submit.
    fireEvent.change(screen.getByLabelText("D1 第一位"), {
      target: { value: "k1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /吴 普强/ }));
    expect(submitted).not.toHaveBeenCalled();

    // The button is the only path.
    fireEvent.click(screen.getByRole("button", { name: "搜索阵容" }));
    expect(submitted).toHaveBeenCalledTimes(1);
  });
});
