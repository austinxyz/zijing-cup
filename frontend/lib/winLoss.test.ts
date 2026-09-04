import { describe, expect, it } from "vitest";

import { formatWinLoss, isHotHand, winRate } from "./winLoss";

describe("formatWinLoss", () => {
  it("shows record and rounded percentage for a real record", () => {
    // 67 / (67 + 20) = 77.01% → 77%.
    expect(formatWinLoss(67, 20)).toEqual({ record: "67-20", rate: "77%" });
  });

  it("rounds the percentage to a whole number", () => {
    // 2 / 3 = 66.67% → 67%.
    expect(formatWinLoss(2, 1)).toEqual({ record: "2-1", rate: "67%" });
  });

  it("shows an em dash when the record was never imported", () => {
    // null ≠ 0: no record is a different claim from 0-0, so no 0-0/0%.
    expect(formatWinLoss(null, null)).toEqual({ record: "—", rate: null });
    expect(formatWinLoss(67, null)).toEqual({ record: "—", rate: null });
    expect(formatWinLoss(null, 20)).toEqual({ record: "—", rate: null });
  });

  it("shows 0-0 but no percentage for a real 0 wins 0 losses (no divide by zero)", () => {
    expect(formatWinLoss(0, 0)).toEqual({ record: "0-0", rate: null });
  });

  it("handles a real 0 losses as 100%", () => {
    expect(formatWinLoss(5, 0)).toEqual({ record: "5-0", rate: "100%" });
  });

  it("winRate returns the percentage or null (never divides by zero)", () => {
    expect(winRate(67, 20)).toBeCloseTo(77.01, 1);
    expect(winRate(3, 1)).toBe(75);
    expect(winRate(null, null)).toBeNull();
    expect(winRate(0, 0)).toBeNull();
  });

  it("isHotHand is true only for a real rate ≥ threshold", () => {
    expect(isHotHand(3, 1)).toBe(true); // 75%
    expect(isHotHand(3, 2)).toBe(true); // 60% exactly
    expect(isHotHand(1, 1)).toBe(false); // 50%
    expect(isHotHand(6, 4)).toBe(true); // 60%
    // Never imported and a real 0-0 are NOT hot — absence is not a low score.
    expect(isHotHand(null, null)).toBe(false);
    expect(isHotHand(undefined, undefined)).toBe(false);
    expect(isHotHand(0, 0)).toBe(false);
  });

  it("treats an absent field (undefined) like never-imported, not NaN", () => {
    // A stale/older API response can omit the field entirely; guard against
    // "undefined-undefined" / "NaN%" rather than trust it is always present.
    expect(
      formatWinLoss(undefined as unknown as number, undefined as unknown as number),
    ).toEqual({ record: "—", rate: null });
  });
});
