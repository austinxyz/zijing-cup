import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  addPlayerNote: vi.fn(),
  deletePlayerNote: vi.fn(),
}));

import type { PlayerNote } from "@/lib/api";

import { addPlayerNote, deletePlayerNote } from "./actions";
import { NotesSection } from "./NotesSection";
import { PlayerEditProvider } from "./PlayerEditContext";

afterEach(() => vi.clearAllMocks());

const NOTES: PlayerNote[] = [
  { id: 3, category: "partner", body: "和 X 搭配好", created_at: "2026-09-06T14:20:00Z" },
  { id: 2, category: "weakness", body: "反手薄弱", created_at: "2026-09-02T09:11:00Z" },
  { id: 1, category: "strength", body: "正手很重", created_at: "2026-08-28T20:03:00Z" },
];

function renderSection({
  notes = NOTES,
  canEdit = true,
  editing = true,
}: {
  notes?: PlayerNote[];
  canEdit?: boolean;
  editing?: boolean;
} = {}) {
  return render(
    <PlayerEditProvider canEdit={canEdit} initialEditing={editing}>
      <NotesSection season="2025" division="silver" playerId={7} notes={notes} />
    </PlayerEditProvider>,
  );
}

describe("NotesSection timeline", () => {
  it("renders notes newest-first with a Chinese category label, body and time", () => {
    renderSection({ editing: false });

    const list = screen.getByRole("list", { name: "评价时间线" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // The category keys become Chinese labels, in the order given (newest first).
    expect(within(items[0]).getByText("适合搭档")).toBeTruthy();
    expect(within(items[0]).getByText("和 X 搭配好")).toBeTruthy();
    expect(within(items[1]).getByText("弱点")).toBeTruthy();
    expect(within(items[2]).getByText("优点")).toBeTruthy();
  });

  it("shows the empty state when there are no notes", () => {
    renderSection({ notes: [] });
    expect(screen.getByText(/还没有评价/)).toBeTruthy();
  });
});

describe("NotesSection append form", () => {
  it("disables 追加 until the body has text", () => {
    renderSection();
    const button = screen.getByRole("button", { name: "追加" });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "网前果断" } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("hides the append form entirely when not in edit mode", () => {
    renderSection({ editing: false });
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });
});

describe("NotesSection delete", () => {
  it("asks for confirmation and cancel does not delete", () => {
    renderSection();
    const list = screen.getByRole("list", { name: "评价时间线" });
    const first = within(list).getAllByRole("listitem")[0];

    fireEvent.click(within(first).getByRole("button", { name: "删除" }));
    // Inline confirm appears; nothing deleted yet.
    expect(within(first).getByText(/删除这条/)).toBeTruthy();
    fireEvent.click(within(first).getByRole("button", { name: "取消" }));
    expect(deletePlayerNote).not.toHaveBeenCalled();
  });

  it("deletes the note on confirm", () => {
    renderSection();
    const list = screen.getByRole("list", { name: "评价时间线" });
    const first = within(list).getAllByRole("listitem")[0];

    fireEvent.click(within(first).getByRole("button", { name: "删除" }));
    fireEvent.click(within(first).getByRole("button", { name: "确认" }));
    expect(deletePlayerNote).toHaveBeenCalledWith("2025", "silver", 7, 3);
  });
});
