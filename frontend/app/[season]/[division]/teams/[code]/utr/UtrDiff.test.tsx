import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SheetDiff } from "./actions";
import { UtrDiff } from "./UtrDiff";

function diff(overrides: Partial<SheetDiff> = {}): SheetDiff {
  return {
    changes: [],
    errors: [],
    counts: {
      singles_utr: 0,
      singles_status: 0,
      doubles_utr: 0,
      doubles_status: 0,
      utr_profile_id: 0,
    },
    covered: 0,
    not_covered: 0,
    applicable: true,
    elsewhere: {},
    ...overrides,
  };
}

function show(overrides: Partial<SheetDiff> = {}) {
  render(
    <UtrDiff diff={diff(overrides)} onApply={vi.fn()} onBack={vi.fn()} />,
  );
}

const ONE_CHANGE: SheetDiff["changes"] = [
  {
    player_id: 1042,
    last_name: "南",
    first_name: "望舒",
    fields: [{ field: "doubles_utr", old: null, new: "6.40" }],
  },
];

describe("what each player's row says", () => {
  it("shows the old value and the new one", () => {
    show({ changes: ONE_CHANGE, counts: { ...diff().counts, doubles_utr: 1 } });

    const row = screen.getByLabelText("南望舒");
    expect(within(row).getByText("6.40")).toBeTruthy();
  });

  it("keeps a place for the fields that did not change", () => {
    // Dropping them fills the screen with edits and hides the useful fact:
    // that this person had only their doubles touched.
    show({ changes: ONE_CHANGE, counts: { ...diff().counts, doubles_utr: 1 } });

    const row = screen.getByLabelText("南望舒");
    expect(within(row).getAllByText("不变").length).toBeGreaterThan(0);
  });
});

describe("the per-field tally", () => {
  it("shows how many changes each field accounts for", () => {
    // The signal a per-person layout throws away: a column pasted one place
    // over shows up here as one field with an implausible count.
    show({
      counts: {
        singles_utr: 12,
        singles_status: 12,
        doubles_utr: 1,
        doubles_status: 1,
        utr_profile_id: 0,
      },
    });

    const tally = screen.getByLabelText("按字段的改动数");
    expect(within(tally).getAllByText("12").length).toBe(2);
    expect(within(tally).getAllByText("1").length).toBe(2);
  });

  it("tallies win and loss changes under 胜/负 labels", () => {
    // Without their own tally entry a whole 胜/负 column pasted one place over
    // would be invisible here — the very signal this tally exists for.
    show({ counts: { ...diff().counts, wins: 5, losses: 5 } });

    const tally = screen.getByLabelText("按字段的改动数");
    expect(within(tally).getByText("胜")).toBeTruthy();
    expect(within(tally).getByText("负")).toBeTruthy();
  });
});

describe("the confirm button", () => {
  it("is disabled while anything is wrong, and says how much", () => {
    show({
      applicable: false,
      errors: [
        { line_number: 4, message: "单打状态 只接受 ..." },
        { line_number: 9, message: "id 1058 在库里是 ..." },
      ],
      changes: ONE_CHANGE,
    });

    const button = screen.getByRole("button", { name: /确认写入/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/先解决 2 条/)).toBeTruthy();
  });

  it("is live when the sheet is clean", () => {
    show({ changes: ONE_CHANGE, counts: { ...diff().counts, doubles_utr: 1 } });

    const button = screen.getByRole("button", { name: /确认写入/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows every error with the line it is on", () => {
    show({
      applicable: false,
      errors: [{ line_number: 9, message: "id 1058 在库里是「谢 行简」" }],
    });

    expect(screen.getByText(/第 9 行/)).toBeTruthy();
    expect(screen.getByText(/谢 行简/)).toBeTruthy();
  });
});

describe("what the sheet did not say", () => {
  it("counts the players it left out, on the neutral tier", () => {
    // Filling in a handful is normal, so this is not a warning — but unsaid
    // it would read as the whole squad.
    show({ covered: 5, not_covered: 21 });

    const note = screen.getByText("本表覆盖 5 人，队里另外 21 人未包含");
    expect(note.className).not.toMatch(/warning|danger/);
  });

  it("says nothing when the sheet covered everyone", () => {
    show({ covered: 26, not_covered: 0 });

    expect(screen.queryByText(/未包含/)).toBeNull();
  });
});

describe("players who sit on another team", () => {
  it("names them, because the change reaches that team too", () => {
    show({
      changes: ONE_CHANGE,
      counts: { ...diff().counts, doubles_utr: 1 },
      elsewhere: { "1042": ["gold · ZJU-USC"] },
    });

    // Once at the top, saying how many, and once beside the person.
    expect(screen.getByText(/也在别的组的名单上/)).toBeTruthy();
    const row = screen.getByLabelText("南望舒");
    expect(within(row).getByText(/gold · ZJU-USC/)).toBeTruthy();
  });

  it("stays quiet when nobody is doubled up", () => {
    show({ changes: ONE_CHANGE, counts: { ...diff().counts, doubles_utr: 1 } });

    expect(screen.queryByText(/也在别的组的名单上/)).toBeNull();
  });
});
