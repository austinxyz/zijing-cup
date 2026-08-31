import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { UtrSheetRow } from "@/lib/api";
import { UtrExport } from "./UtrExport";

function row(overrides: Partial<UtrSheetRow> = {}): UtrSheetRow {
  return {
    player_id: 1042,
    last_name: "南",
    first_name: "望舒",
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
    utr_profile_id: null,
    ...overrides,
  };
}

describe("UtrExport", () => {
  it("lays out the eight columns the import expects back", () => {
    render(<UtrExport rows={[row()]} />);

    for (const heading of [
      "id",
      "姓",
      "名",
      "当前单打",
      "单打状态",
      "当前双打",
      "双打状态",
      "UTR链接",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
  });

  it("marks the three columns that must come back untouched", () => {
    // They are the row's identity. Editing them is the one way the round trip
    // breaks, so the sheet says so before anyone starts typing.
    render(<UtrExport rows={[row()]} />);

    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    for (const index of [0, 1, 2]) {
      expect(cells[index].className).toMatch(/surface-muted/);
    }
    expect(cells[3].className).not.toMatch(/surface-muted/);
  });

  it("carries existing values out so they can be edited in place", () => {
    render(
      <UtrExport
        rows={[row({ singles_utr: "6.90", singles_status: "rated" })]}
      />,
    );

    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell");
    expect(cells[3].textContent).toBe("6.90");
    expect(cells[4].textContent).toBe("rated");
  });

  it("offers both ways of taking the sheet away", () => {
    render(<UtrExport rows={[row()]} />);

    expect(screen.getByRole("button", { name: "复制整张表" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载 CSV" })).toBeTruthy();
  });

  it("says not to touch the first three columns", () => {
    render(<UtrExport rows={[row()]} />);

    expect(screen.getByText(/别改/)).toBeTruthy();
  });
});
