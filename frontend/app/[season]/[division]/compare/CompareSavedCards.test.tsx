import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SavedComparisonView } from "./comparisonView";
import { CompareSavedCards } from "./CompareSavedCards";

function view(over: Partial<SavedComparisonView> = {}): SavedComparisonView {
  return {
    id: 1, name: "打 THU 预案",
    aLabel: "UCSD-ZJU-UCB 主力", bLabel: "THU-MIT 强阵",
    aDeleted: false, bDeleted: false,
    lines: [
      {
        line: "D1",
        a: [{ name: "陈 嘉禾", gender: "M" }, { name: "吴 普强", gender: "M" }],
        b: [{ name: "Chen Yilun", gender: "M" }, { name: "Lu Xiang", gender: "M" }],
        aSum: "14.08", bSum: "13.80", diff: 0.28, note: "我方略强",
      },
    ],
    totalA: "59.45", totalB: "57.30", totalDiff: 2.15,
    ...over,
  };
}

describe("CompareSavedCards collapse/expand", () => {
  it("starts collapsed: shows name + labels, hides the comparison table", () => {
    render(<CompareSavedCards views={[view()]} canEdit={false} />);
    expect(screen.getByText("打 THU 预案")).toBeTruthy();
    // the D1 comparison row is not rendered until expanded
    expect(screen.queryByRole("row", { name: /D1/ })).toBeNull();
  });

  it("expands in place to render the line-by-line comparison, then collapses", () => {
    render(<CompareSavedCards views={[view()]} canEdit={false} />);
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    const row = screen.getByRole("row", { name: /D1/ });
    expect(within(row).getByText("陈 嘉禾")).toBeTruthy();
    expect(within(row).getByText(/\+0\.28/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    expect(screen.queryByRole("row", { name: /D1/ })).toBeNull();
  });

  it("marks a deleted side and does not render its seats", () => {
    const v = view({
      bDeleted: true, bLabel: "THU-MIT（阵容已删）",
      lines: [{ line: "D1", a: [{ name: "陈 嘉禾", gender: "M" }], b: null, aSum: "14.08", bSum: null, diff: null, note: "" }],
      totalB: null, totalDiff: null,
    });
    render(<CompareSavedCards views={[v]} canEdit={false} />);
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    expect(screen.getByText("阵容已删")).toBeTruthy();
  });
});

describe("CompareSavedCards line notes + delete", () => {
  it("edits a line note and calls onSetNote", async () => {
    const onSetNote = vi.fn().mockResolvedValue(undefined);
    render(<CompareSavedCards views={[view()]} canEdit onSetNote={onSetNote} />);
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    const input = screen.getByDisplayValue("我方略强");
    fireEvent.change(input, { target: { value: "改了" } });
    fireEvent.blur(input);
    expect(onSetNote).toHaveBeenCalledWith(1, "D1", "改了");
  });

  it("hides note editing and delete when not editable", () => {
    render(<CompareSavedCards views={[view()]} canEdit={false} />);
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  });

  it("calls onDelete when the delete button is used", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<CompareSavedCards views={[view()]} canEdit onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it("surfaces a note-save failure and rolls the field back", async () => {
    const onSetNote = vi.fn().mockRejectedValue(new Error("季 2026 已锁"));
    render(<CompareSavedCards views={[view()]} canEdit onSetNote={onSetNote} />);
    fireEvent.click(screen.getByRole("button", { name: /打 THU 预案/ }));
    const input = screen.getByDisplayValue("我方略强");
    fireEvent.change(input, { target: { value: "改了" } });
    fireEvent.blur(input);
    expect(await screen.findByRole("alert")).toHaveTextContent("季 2026 已锁");
    // rolled back to the last persisted value, so it does not look saved
    expect(screen.getByLabelText("D1 本线备注")).toHaveValue("我方略强");
  });

  it("surfaces a delete failure", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("删不了"));
    render(<CompareSavedCards views={[view()]} canEdit onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("删不了");
  });
});
