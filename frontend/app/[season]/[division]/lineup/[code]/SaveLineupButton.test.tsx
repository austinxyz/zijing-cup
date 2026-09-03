import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupCandidate, LineupPlayer } from "@/lib/api";
import { SaveLineupButton } from "./SaveLineupButton";

function player(key: string): LineupPlayer {
  return {
    key, last_name: key, first_name: "x", gender: "M",
    match_utr: "6.00", origin: "frozen", origin_year: null, is_unresolved: false,
  };
}

const CANDIDATE = {
  total: "50", buffer_spent: "0", line_totals: {},
  lines: { D1: [player("p1"), player("p2")], D2: [player("p3"), player("p4")] },
} as unknown as LineupCandidate;

describe("SaveLineupButton gating", () => {
  it("is hidden from a non-admin", () => {
    render(<SaveLineupButton candidate={CANDIDATE} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /保存此阵容/ })).toBeNull();
  });

  it("saves the candidate assignment under a typed name for an admin", async () => {
    const saveAction = vi.fn().mockResolvedValue(undefined);
    render(
      <SaveLineupButton candidate={CANDIDATE} canEdit={true} saveAction={saveAction} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /保存此阵容/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "打交大" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    expect(saveAction).toHaveBeenCalledWith("打交大", {
      D1: ["p1", "p2"],
      D2: ["p3", "p4"],
    });
  });
});
