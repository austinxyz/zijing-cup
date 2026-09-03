import { describe, expect, it } from "vitest";

import { replaceSlot, swapSlots, type Slot } from "./editor";

const ASSIGN: Record<string, [string, string]> = {
  D1: ["p1", "p2"],
  D2: ["p3", "p4"],
  MD: ["p5", "p6"],
};

describe("swapSlots", () => {
  it("exchanges the two named seats across lines", () => {
    const a: Slot = { line: "D1", index: 0 }; // p1
    const b: Slot = { line: "D2", index: 1 }; // p4
    const out = swapSlots(ASSIGN, a, b);
    expect(out.D1).toEqual(["p4", "p2"]);
    expect(out.D2).toEqual(["p3", "p1"]);
    // untouched line unchanged
    expect(out.MD).toEqual(["p5", "p6"]);
  });

  it("swaps two seats on the same line", () => {
    const out = swapSlots(ASSIGN, { line: "D1", index: 0 }, { line: "D1", index: 1 });
    expect(out.D1).toEqual(["p2", "p1"]);
  });

  it("does not mutate the input", () => {
    swapSlots(ASSIGN, { line: "D1", index: 0 }, { line: "D2", index: 0 });
    expect(ASSIGN.D1).toEqual(["p1", "p2"]);
    expect(ASSIGN.D2).toEqual(["p3", "p4"]);
  });
});

describe("replaceSlot", () => {
  it("sets one seat to the chosen player key", () => {
    const out = replaceSlot(ASSIGN, { line: "MD", index: 1 }, "p9");
    expect(out.MD).toEqual(["p5", "p9"]);
    expect(out.D1).toEqual(["p1", "p2"]);
  });

  it("does not mutate the input", () => {
    replaceSlot(ASSIGN, { line: "MD", index: 0 }, "p9");
    expect(ASSIGN.MD).toEqual(["p5", "p6"]);
  });
});
