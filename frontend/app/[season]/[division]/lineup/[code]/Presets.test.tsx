import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import type { LineupFilterPreset, LineupPlayer, RuleLine } from "@/lib/api";
import { Presets } from "./Presets";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
];

function player(key: string, first: string, gender = "M"): LineupPlayer {
  return {
    key, last_name: "南", first_name: first, gender,
    match_utr: "6.00", origin: "frozen", origin_year: 2025, is_unresolved: false,
  };
}

// Roster has p1, p2, p3 — NOT p9 (a departed player).
const ROSTER = [player("p1", "甲"), player("p2", "乙"), player("p3", "丙", "F")];

function preset(over: Partial<LineupFilterPreset> = {}): LineupFilterPreset {
  return {
    id: 1, name: "主力阵",
    constraints: { locks: { D1: ["p1", "p2"] }, excluded: ["p3"] },
    ...over,
  };
}

function show(over: {
  presets?: LineupFilterPreset[];
  canEdit?: boolean;
  hasConstraints?: boolean;
} = {}) {
  render(
    <Presets
      presets={over.presets ?? [preset()]}
      roster={ROSTER}
      lines={LINES}
      canEdit={over.canEdit ?? false}
      hasConstraints={over.hasConstraints ?? true}
      basePath="/2025/silver/lineup/PRE-A"
    />,
  );
}

describe("Presets list and gating", () => {
  it("lists each preset with name, size, and a load control", () => {
    show();
    expect(screen.getByText("主力阵")).toBeTruthy();
    // size: 1 lock, 1 exclude
    expect(screen.getByText(/锁\s*1/)).toBeTruthy();
    expect(screen.getByText(/排\s*1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /载入/ })).toBeTruthy();
  });

  it("shows save and delete only to an admin", () => {
    show({ canEdit: true });
    expect(screen.getByText("存为阵型")).toBeTruthy();
    expect(screen.getByRole("button", { name: /删除/ })).toBeTruthy();
  });

  it("hides save and delete from a non-admin", () => {
    show({ canEdit: false });
    expect(screen.queryByText("存为阵型")).toBeNull();
    expect(screen.queryByRole("button", { name: /删除/ })).toBeNull();
  });

  it("disables save when there is nothing to save", () => {
    show({ canEdit: true, hasConstraints: false });
    const save = screen.getByRole("button", { name: /存为阵型/ });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Presets load: stale locks vs navigate", () => {
  it("refuses to load a preset whose lock names a departed player", () => {
    // D1 locks p9, not on the roster.
    show({ presets: [preset({ constraints: { locks: { D1: ["p1", "p9"] }, excluded: [] } })] });
    fireEvent.click(screen.getByRole("button", { name: /载入/ }));

    expect(screen.getByText(/这个阵型已过期/)).toBeTruthy();
    expect(screen.getByText(/D1/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("loads normally when only an excluded player has departed", () => {
    push.mockClear();
    // excluded p9 is gone, but locks are all valid → navigate anyway.
    show({ presets: [preset({ constraints: { locks: { D1: ["p1", "p2"] }, excluded: ["p9"] } })] });
    fireEvent.click(screen.getByRole("button", { name: /载入/ }));

    expect(screen.queryByText(/这个阵型已过期/)).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0][0] as string;
    expect(href).toContain("D1a=p1");
    expect(href).toContain("D1b=p2");
    // the departed excluded key is dropped, not carried
    expect(href).not.toContain("p9");
  });
});
