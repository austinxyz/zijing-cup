import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => searchParams,
}));

import type { LineupFilterPreset, LineupPlayer, RuleLine } from "@/lib/api";
import { Presets } from "./Presets";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
];

function player(key: string, first: string, gender = "M"): LineupPlayer {
  return {
    key, player_id: Number(String(key).replace(/\D/g, "")) || 0, last_name: "南", first_name: first, gender,
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

describe("Presets load-then-update: name prefill + 更新 label", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    push.mockClear();
  });

  it("prefills the name box from the ?preset= param on load", () => {
    searchParams = new URLSearchParams("preset=" + encodeURIComponent("主力阵"));
    show({ canEdit: true, presets: [preset({ name: "主力阵" })] });
    const box = screen.getByLabelText("阵型名") as HTMLInputElement;
    expect(box.value).toBe("主力阵");
  });

  it("shows 更新「X」 when the name matches an existing preset", () => {
    searchParams = new URLSearchParams("preset=" + encodeURIComponent("主力阵"));
    show({ canEdit: true, presets: [preset({ name: "主力阵" })] });
    expect(screen.getByRole("button", { name: /更新「主力阵」/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^存为阵型$/ })).toBeNull();
  });

  it("shows 存为阵型 with no preset param and an empty name", () => {
    show({ canEdit: true, presets: [preset({ name: "主力阵" })] });
    expect(screen.getByRole("button", { name: /存为阵型/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /更新/ })).toBeNull();
  });

  it("switches label live: typing a new name → 存为阵型, typing an existing name → 更新", () => {
    searchParams = new URLSearchParams("preset=" + encodeURIComponent("主力阵"));
    show({ canEdit: true, presets: [preset({ name: "主力阵" })] });
    const box = screen.getByLabelText("阵型名");
    // loaded → 更新
    expect(screen.getByRole("button", { name: /更新「主力阵」/ })).toBeTruthy();
    // type a brand-new name → 存为阵型
    fireEvent.change(box, { target: { value: "新阵" } });
    expect(screen.getByRole("button", { name: /存为阵型/ })).toBeTruthy();
    // back to an existing name → 更新
    fireEvent.change(box, { target: { value: "主力阵" } });
    expect(screen.getByRole("button", { name: /更新「主力阵」/ })).toBeTruthy();
  });
});

describe("Presets 更新 click saves live form under the same name", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("preset=" + encodeURIComponent("主力阵"));
  });

  it("calls saveAction with the live-form constraints and the loaded name", () => {
    const saveAction = vi.fn().mockResolvedValue(undefined);
    render(
      <form>
        {/* live lock on D1 = p1/p2, so hasLiveConstraints is true */}
        <select name="D1a" defaultValue="p1">
          <option value="" />
          <option value="p1">p1</option>
          <option value="p2">p2</option>
        </select>
        <select name="D1b" defaultValue="p2">
          <option value="" />
          <option value="p1">p1</option>
          <option value="p2">p2</option>
        </select>
        <Presets
          presets={[preset({ name: "主力阵" })]}
          roster={ROSTER}
          lines={LINES}
          canEdit
          hasConstraints
          basePath="/2025/silver/lineup/PRE-A"
          saveAction={saveAction}
        />
      </form>,
    );

    fireEvent.click(screen.getByRole("button", { name: /更新「主力阵」/ }));

    expect(saveAction).toHaveBeenCalledTimes(1);
    const [live, savedName] = saveAction.mock.calls[0];
    expect(savedName).toBe("主力阵");
    expect(live.locks).toEqual({ D1: ["p1", "p2"] });
  });
});
