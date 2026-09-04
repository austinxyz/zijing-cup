import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LineBlock, type LineSeat } from "./LineBlock";

const SEATS: [LineSeat, LineSeat] = [
  { name: "陈嘉禾", gender: "M", utr: "6.98", estimate: false },
  { name: "雨萌", gender: "F", utr: "4.60", estimate: true },
];

describe("LineBlock", () => {
  it("shows the line header with sum and buffer, then a row per player with ♂/♀ + UTR", () => {
    render(<LineBlock line="D1" total="11.58" over="0" seats={SEATS} />);
    const block = screen.getByLabelText("D1");
    expect(within(block).getByText(/11\.58/)).toBeTruthy();
    // one row per player
    expect(within(block).getByText("陈嘉禾")).toBeTruthy();
    expect(within(block).getByText("雨萌")).toBeTruthy();
    expect(within(block).getByText(/6\.98/)).toBeTruthy();
    expect(within(block).getByText(/4\.60/)).toBeTruthy();
    // gender symbols
    expect(within(block).getByText("♂")).toBeTruthy();
    expect(within(block).getByText("♀")).toBeTruthy();
  });

  it("flags an over-cap line in danger", () => {
    const { container } = render(
      <LineBlock line="D2" total="12.42" over="0.42" seats={SEATS} />,
    );
    expect(screen.getByText(/超\s*0\.42/)).toBeTruthy();
    // the block carries a danger marker class
    expect(container.querySelector(".border-danger-border, .bg-danger-surface")).toBeTruthy();
  });

  it("marks a borrowed player distinctly, and leaves a regular one unmarked", () => {
    render(
      <LineBlock
        line="D3"
        seats={[
          { name: "外援甲", gender: "M", utr: "6.00", estimate: false, borrowed: true },
          { name: "本校乙", gender: "M", utr: "5.80", estimate: false },
        ]}
      />,
    );
    const block = screen.getByLabelText("D3");
    // the borrowed player carries a 外 mark; the regular one does not
    const borrowedRow = within(block).getByText("外援甲").closest("div")!;
    expect(within(borrowedRow).getByText("外")).toBeTruthy();
    const regularRow = within(block).getByText("本校乙").closest("div")!;
    expect(within(regularRow).queryByText("外")).toBeNull();
  });

  it("marks a hot hand (win rate ≥ 60%) and gives every seat a win-rate hover", () => {
    render(
      <LineBlock
        line="D4"
        seats={[
          { name: "热手甲", gender: "M", utr: "6.0", estimate: false, wins: 67, losses: 20 },
          { name: "平手乙", gender: "M", utr: "5.8", estimate: false, wins: 1, losses: 1 },
        ]}
      />,
    );
    const block = screen.getByLabelText("D4");
    // hot-hand row is marked; the 50% row is not
    const hotRow = within(block).getByText("热手甲").closest("div")!;
    expect(hotRow.getAttribute("title")).toMatch(/67-20/);
    expect(hotRow.getAttribute("title")).toMatch(/77%/);
    expect(within(hotRow).getByText("▲")).toBeTruthy();
    const coldRow = within(block).getByText("平手乙").closest("div")!;
    expect(within(coldRow).queryByText("▲")).toBeNull();
    // but the cold row still shows its record on hover
    expect(coldRow.getAttribute("title")).toMatch(/1-1/);
  });

  it("gives a seat with no record a neutral win-rate hover and no marker", () => {
    render(
      <LineBlock
        line="D5"
        seats={[
          { name: "无战绩甲", gender: "M", utr: "6.0", estimate: false, wins: null, losses: null },
          { name: "乙", gender: "M", utr: "5.8", estimate: false },
        ]}
      />,
    );
    const block = screen.getByLabelText("D5");
    const row = within(block).getByText("无战绩甲").closest("div")!;
    expect(within(row).queryByText("▲")).toBeNull();
    expect(row.getAttribute("title")).toMatch(/胜率\s*—/);
  });

  it("marks an estimated UTR and blanks a missing one", () => {
    render(
      <LineBlock
        line="MD"
        seats={[
          { name: "甲", gender: "M", utr: "6.00", estimate: true },
          { name: "乙", gender: null, utr: "", estimate: false },
        ]}
      />,
    );
    const block = screen.getByLabelText("MD");
    // estimated marker present somewhere in the block
    expect(within(block).getByText(/估/)).toBeTruthy();
    // missing gender renders a neutral dash, not a crash
    expect(within(block).getByText("—")).toBeTruthy();
  });
});
