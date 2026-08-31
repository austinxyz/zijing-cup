import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

describe("when the clipboard refuses", () => {
  it("says so instead of leaving the person thinking it copied", async () => {
    // A silent failure here is the exact shape of mistake this whole feature
    // is built to avoid: the person walks away believing they have the sheet.
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UtrExport rows={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "复制整张表" }));

    expect(await screen.findByText(/复制没有成功/)).toBeTruthy();
  });

  it("confirms when it did copy", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<UtrExport rows={[row()]} />);
    fireEvent.click(screen.getByRole("button", { name: "复制整张表" }));

    expect(await screen.findByText(/已复制/)).toBeTruthy();
  });
});

describe("taking the sheet away as CSV", () => {
  it("quotes a cell that contains the delimiter", async () => {
    // The parser reads quoted cells; the export has to write them, or a name
    // with a comma in it comes back one column over — which is the single
    // most damaging way this round trip can fail.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    let captured = "";
    const OriginalBlob = globalThis.Blob;
    // @ts-expect-error — replaced for the duration of this test
    globalThis.Blob = class {
      constructor(parts: string[]) {
        captured = parts.join("");
      }
    };
    globalThis.URL.createObjectURL = vi.fn(() => "blob:x");
    globalThis.URL.revokeObjectURL = vi.fn();

    render(<UtrExport rows={[row({ first_name: "望舒, Jr." })]} />);
    fireEvent.click(screen.getByRole("button", { name: "下载 CSV" }));

    globalThis.Blob = OriginalBlob;
    expect(captured).toContain('"望舒, Jr."');
  });
});
