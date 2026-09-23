import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SeasonSamplingRow } from "@/lib/api";
import { SamplingMonitor } from "./SamplingMonitor";

const DATES = ["2026-09-21", "2026-09-22"];

function row(over: Partial<SeasonSamplingRow> = {}): SeasonSamplingRow {
  return {
    player_id: 1, last_name: "叶", first_name: "明", divisions: ["gold"],
    samples: [
      { sample_date: "2026-09-21", doubles_utr: "6.70", doubles_status: "rated" },
      { sample_date: "2026-09-22", doubles_utr: "6.74", doubles_status: "rated" },
    ],
    rated_avg: "6.72", flag: "ok", can_set: true,
    ...over,
  };
}

function show(rows: SeasonSamplingRow[], over: { snapshot?: () => Promise<void>; set?: (id: number) => Promise<void> } = {}) {
  render(
    <SamplingMonitor
      season="2026"
      dates={DATES}
      rows={rows}
      snapshotAction={over.snapshot ?? vi.fn()}
      setAction={over.set ?? vi.fn()}
    />,
  );
}

describe("SamplingMonitor rows + average", () => {
  it("shows each player with a cell per date and the rated average", () => {
    show([row()]);
    const r = screen.getByRole("row", { name: /叶 明/ });
    expect(within(r).getByText("6.70")).toBeTruthy();
    expect(within(r).getByText("6.74")).toBeTruthy();
    expect(within(r).getByText("6.72")).toBeTruthy(); // rated avg
  });

  it("shows 定为 with the average when can_set, and 正常 flag", () => {
    show([row()]);
    expect(screen.getByRole("button", { name: /定为.*6\.72/ })).toBeTruthy();
    expect(screen.getByText("正常")).toBeTruthy();
  });

  it("hides 定为 and shows 待核 for a needs_review player", () => {
    show([row({ player_id: 2, first_name: "乙", flag: "needs_review", can_set: false, rated_avg: "6.54",
      samples: [{ sample_date: "2026-09-21", doubles_utr: "6.60", doubles_status: "projected" }] })]);
    expect(screen.queryByRole("button", { name: /定为/ })).toBeNull();
    // scope to the player row — "待核" is also a filter tab label
    const r = screen.getByRole("row", { name: /叶 乙/ });
    expect(within(r).getByText("待核")).toBeTruthy();
  });
});

describe("SamplingMonitor filter + actions", () => {
  it("filters to only 待核 rows", () => {
    show([
      row({ player_id: 1, first_name: "甲", flag: "ok", can_set: true }),
      row({ player_id: 2, first_name: "乙", flag: "needs_review", can_set: false }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "待核" }));
    expect(screen.queryByRole("row", { name: /叶 甲/ })).toBeNull();
    expect(screen.getByRole("row", { name: /叶 乙/ })).toBeTruthy();
  });

  it("filters by division (金组)", () => {
    show([
      row({ player_id: 1, first_name: "金人", divisions: ["gold"] }),
      row({ player_id: 2, first_name: "银人", divisions: ["silver"] }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "金组" }));
    expect(screen.getByRole("row", { name: /金人/ })).toBeTruthy();
    expect(screen.queryByRole("row", { name: /银人/ })).toBeNull();
  });

  it("shows a dual-division player under both 金组 and 银组 filters", () => {
    show([row({ player_id: 3, first_name: "两栖", divisions: ["gold", "silver"] })]);
    fireEvent.click(screen.getByRole("button", { name: "金组" }));
    expect(screen.getByRole("row", { name: /两栖/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "银组" }));
    expect(screen.getByRole("row", { name: /两栖/ })).toBeTruthy();
    // the 组 cell names both
    const r = screen.getByRole("row", { name: /两栖/ });
    expect(within(r).getByText("金/银")).toBeTruthy();
  });

  it("定为 click calls setAction with the player id", () => {
    const set = vi.fn().mockResolvedValue(undefined);
    show([row({ player_id: 7 })], { set });
    fireEvent.click(screen.getByRole("button", { name: /定为/ }));
    expect(set).toHaveBeenCalledWith(7);
  });

  it("快照今天 calls snapshotAction", () => {
    const snapshot = vi.fn().mockResolvedValue(undefined);
    show([row()], { snapshot });
    fireEvent.click(screen.getByRole("button", { name: /快照今天/ }));
    expect(snapshot).toHaveBeenCalled();
  });
});
