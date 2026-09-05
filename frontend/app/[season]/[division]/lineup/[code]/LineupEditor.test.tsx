import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { LineupPlayer, LineupViolation, SavedLineup } from "@/lib/api";
import { LineupEditor } from "./LineupEditor";

function player(key: string, first: string): LineupPlayer {
  return {
    key, last_name: "南", first_name: first, gender: "M",
    match_utr: "6.00", origin: "frozen", origin_year: 2025, is_unresolved: false,
  };
}

// Roster p1..p6 (placed) plus p7 (a bench option for replace).
const ROSTER = [
  ["p1", "甲"], ["p2", "乙"], ["p3", "丙"], ["p4", "丁"],
  ["p5", "戊"], ["p6", "己"], ["p7", "庚"],
].map(([k, n]) => player(k, n));

const LINE_ORDER = ["D1", "D2", "D3", "MD", "WD"];

function saved(): SavedLineup {
  return {
    id: 7, name: "打交大针对阵", sort_order: 0,
    assignment: {
      D1: ["p1", "p2"], D2: ["p3", "p4"], D3: ["p5", "p6"],
      MD: ["p1", "p3"], WD: ["p2", "p4"],
    },
    utr_snapshot: {}, status: "illegal", violations: [], utr_diff: {}, missing: [],
  };
}

function show(over: {
  validateAction?: (a: Record<string, [string, string]>) => Promise<LineupViolation[]>;
  saveBackAction?: (a: Record<string, [string, string]>) => Promise<void>;
} = {}) {
  const validateAction = (over.validateAction ??
    vi.fn().mockResolvedValue([])) as Mock;
  const saveBackAction = (over.saveBackAction ??
    vi.fn().mockResolvedValue(undefined)) as Mock;
  render(
    <LineupEditor
      saved={saved()}
      roster={ROSTER}
      lineOrder={LINE_ORDER}
      validateAction={validateAction}
      saveBackAction={saveBackAction}
    />,
  );
  return { validateAction, saveBackAction };
}

describe("LineupEditor swap and replace", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("replacing a seat sends the changed assignment to validate", async () => {
    const { validateAction } = show();
    // The first select is D1 seat 0 (currently p1). Replace with p7.
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "p7" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(validateAction).toHaveBeenCalledTimes(1);
    const sent = validateAction.mock.calls[0][0] as Record<string, string[]>;
    expect(sent.D1).toEqual(["p7", "p2"]);
  });

  it("swapping two selected seats exchanges their players", async () => {
    const { validateAction } = show();
    // Select D1-seat0 (p1) and D2-seat0 (p3), then swap.
    fireEvent.click(screen.getByRole("button", { name: /选中 D1 第1人/ }));
    fireEvent.click(screen.getByRole("button", { name: /选中 D2 第1人/ }));
    fireEvent.click(screen.getByRole("button", { name: /^互换/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    const sent = validateAction.mock.calls.at(-1)![0] as Record<string, string[]>;
    expect(sent.D1[0]).toBe("p3");
    expect(sent.D2[0]).toBe("p1");
  });
});

describe("LineupEditor live legality (debounced)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces rapid edits into a single validate call", async () => {
    const { validateAction } = show();
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "p7" } });
    fireEvent.change(selects[1], { target: { value: "p6" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(validateAction).toHaveBeenCalledTimes(1);
  });

  it("renders the returned violation when the edit is illegal", async () => {
    const violations: LineupViolation[] = [
      { code: "line_cap", line: "D1", amount: "0.30", message: "D1 超 cap 0.30" },
    ];
    const { validateAction } = show({
      validateAction: vi.fn().mockResolvedValue(violations),
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p7" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    expect(screen.getByText(/D1 超 cap 0\.30/)).toBeTruthy();
    // save-back is not offered while illegal
    expect(screen.getByRole("button", { name: /存回/ })).toHaveProperty("disabled", true);
  });

  it("shows legal and enables save-back when there are no violations", async () => {
    const { saveBackAction } = show();
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "p7" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(350); });
    const back = screen.getByRole("button", { name: /存回/ });
    expect(back).toHaveProperty("disabled", false);
    fireEvent.click(back);
    expect(saveBackAction).toHaveBeenCalledOnce();
    const sent = saveBackAction.mock.calls[0][0] as Record<string, string[]>;
    expect(sent.D1).toEqual(["p7", "p2"]);
  });
});
