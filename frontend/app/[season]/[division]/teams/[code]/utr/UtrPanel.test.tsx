import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { UtrSheetRow } from "@/lib/api";
import { applySheet, previewSheet, type SheetDiff } from "./actions";
import { UtrPanel } from "./UtrPanel";

vi.mock("./actions", () => ({
  previewSheet: vi.fn(),
  applySheet: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

const ROWS: UtrSheetRow[] = [
  {
    player_id: 1042,
    last_name: "南",
    first_name: "望舒",
    singles_utr: null,
    singles_status: null,
    doubles_utr: null,
    doubles_status: null,
    utr_profile_id: null,
  },
];

function diff(overrides: Partial<SheetDiff> = {}): SheetDiff {
  return {
    changes: [
      {
        player_id: 1042,
        last_name: "南",
        first_name: "望舒",
        fields: [{ field: "doubles_utr", old: null, new: "6.40" }],
      },
    ],
    errors: [],
    counts: {
      singles_utr: 0,
      singles_status: 0,
      doubles_utr: 1,
      doubles_status: 0,
      utr_profile_id: 0,
    },
    covered: 1,
    not_covered: 0,
    applicable: true,
    elsewhere: {},
    ...overrides,
  };
}

function show() {
  render(
    <UtrPanel
      rows={ROWS}
      season="2025"
      division="silver"
      teamCode="HUST"
    />,
  );
}

function goToImport() {
  fireEvent.click(screen.getByRole("button", { name: "导入" }));
}

async function paste(text: string) {
  goToImport();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "看差异" }));
}

describe("moving between the two halves of the trip", () => {
  it("opens on the export side", () => {
    show();

    expect(screen.getByRole("button", { name: "复制整张表" })).toBeTruthy();
  });

  it("switches to the import form", () => {
    show();
    goToImport();

    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});

describe("preview, then write", () => {
  it("replaces the form with the diff rather than showing both", async () => {
    // There is exactly one decision at that point, and the form it came from
    // is not part of it.
    vi.mocked(previewSheet).mockResolvedValue(diff());
    show();
    await paste("id\t姓\n1042\t南");

    expect(await screen.findByRole("button", { name: /确认写入/ })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("sends the same text to the write that produced the diff", async () => {
    // Not the diff object: what lands has to be derived from the same source
    // under the same rules as what the person read.
    vi.mocked(previewSheet).mockResolvedValue(diff());
    vi.mocked(applySheet).mockResolvedValue({ updated: 1 });
    show();
    await paste("SHEET-TEXT");

    fireEvent.click(await screen.findByRole("button", { name: /确认写入/ }));

    await waitFor(() =>
      expect(applySheet).toHaveBeenCalledWith(
        "2025",
        "silver",
        "HUST",
        "SHEET-TEXT",
      ),
    );
  });

  it("goes back to the export side once the write lands", async () => {
    vi.mocked(previewSheet).mockResolvedValue(diff());
    vi.mocked(applySheet).mockResolvedValue({ updated: 1 });
    show();
    await paste("SHEET-TEXT");
    fireEvent.click(await screen.findByRole("button", { name: /确认写入/ }));

    expect(
      await screen.findByRole("button", { name: "复制整张表" }),
    ).toBeTruthy();
  });

  it("lets the person go back to the form without writing", async () => {
    vi.mocked(previewSheet).mockResolvedValue(diff());
    show();
    await paste("SHEET-TEXT");
    fireEvent.click(await screen.findByRole("button", { name: "返回改表" }));

    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(applySheet).not.toHaveBeenCalled();
  });
});

describe("when the round trip fails", () => {
  it("says the diff could not be read", async () => {
    vi.mocked(previewSheet).mockRejectedValue(new Error("cold start"));
    show();
    await paste("SHEET-TEXT");

    expect(await screen.findByText(/读不到差异/)).toBeTruthy();
  });

  it("says a failed write landed nothing, so retrying is safe", async () => {
    // The batch is all-or-nothing on the server. Saying so is what stops
    // someone hand-repairing a half-written table that does not exist.
    vi.mocked(previewSheet).mockResolvedValue(diff());
    vi.mocked(applySheet).mockRejectedValue(new Error("boom"));
    show();
    await paste("SHEET-TEXT");
    fireEvent.click(await screen.findByRole("button", { name: /确认写入/ }));

    expect(await screen.findByText(/一处也没有落库/)).toBeTruthy();
  });
});
