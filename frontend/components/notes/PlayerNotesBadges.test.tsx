import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlayerNote } from "@/lib/api";

import { PlayerNotesBadges } from "./PlayerNotesBadges";

const NOTES: PlayerNote[] = [
  { id: 3, category: "weakness", body: "反手薄弱", created_at: "2026-09-02T09:11:00Z" },
  { id: 2, category: "strength", body: "正手很重", created_at: "2026-08-28T20:03:00Z" },
  { id: 1, category: "strength", body: "发球好", created_at: "2026-08-20T20:03:00Z" },
];

afterEach(() => {});

describe("PlayerNotesBadges", () => {
  it("shows one pill per present category with a count", () => {
    render(<PlayerNotesBadges notes={NOTES} label="张三 · 评价" />);
    // strength has 2, weakness has 1 — both pills present with counts.
    expect(screen.getByText("优点")).toBeTruthy();
    expect(screen.getByText("弱点")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    // partner/other absent → no pill
    expect(screen.queryByText("适合搭档")).toBeNull();
    expect(screen.queryByText("其他")).toBeNull();
  });

  it("renders nothing when there are no notes", () => {
    const { container } = render(
      <PlayerNotesBadges notes={[]} label="空 · 评价" />,
    );
    expect(container.textContent).toBe("");
  });

  it("opens the read-only timeline popover on click", () => {
    render(<PlayerNotesBadges notes={NOTES} label="张三 · 评价" />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("list", { name: "评价时间线" })).toBeTruthy();
  });
});

describe("PlayerNotesBadges editable", () => {
  const edit = { onAdd: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) };

  it("shows a 记评价 entry (opening an editable popover) when editable and no notes", () => {
    render(<PlayerNotesBadges notes={[]} label="张三 · 评价" edit={edit} />);
    const entry = screen.getByRole("button", { name: /记评价/ });
    expect(entry).toBeTruthy();
    fireEvent.click(entry);
    // editable popover: append form present, empty-state timeline text
    expect(screen.getByRole("textbox", { name: "评价内容" })).toBeTruthy();
    expect(screen.getByText(/还没有评价/)).toBeTruthy();
  });

  it("renders nothing when NOT editable and no notes", () => {
    const { container } = render(<PlayerNotesBadges notes={[]} label="空 · 评价" />);
    expect(container.textContent).toBe("");
  });

  it("passes edit through to the popover when notes exist", () => {
    render(<PlayerNotesBadges notes={NOTES} label="张三 · 评价" edit={edit} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(screen.getByRole("textbox", { name: "评价内容" })).toBeTruthy();
  });
});
