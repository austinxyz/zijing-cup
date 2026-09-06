import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin", () => ({
  canEdit: vi.fn(),
}));

import { canEdit } from "@/lib/admin";
import PlayersLayout from "./layout";

afterEach(() => vi.clearAllMocks());

function renderLayout() {
  return PlayersLayout({
    children: <div>子内容</div>,
    params: Promise.resolve({ season: "2026", division: "silver" }),
  });
}

describe("players layout no longer gates the whole section", () => {
  it("renders children for a viewer who cannot edit (no redirect)", async () => {
    // The section used to redirect non-editors away; now it is read-only for
    // everyone, and only the write actions are gated (in the page, by mode).
    vi.mocked(canEdit).mockResolvedValue(false);
    render(await renderLayout());
    expect(screen.getByText("子内容")).toBeTruthy();
  });

  it("renders children for an editor too", async () => {
    vi.mocked(canEdit).mockResolvedValue(true);
    render(await renderLayout());
    expect(screen.getByText("子内容")).toBeTruthy();
  });
});
