import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PlayerNote } from "@/lib/api";

import { NotesPopover } from "./NotesPopover";

const NOTES: PlayerNote[] = [
  { id: 3, category: "partner", body: "和 X 搭配好", created_at: "2026-09-06T14:20:00Z" },
  { id: 2, category: "weakness", body: "反手薄弱", created_at: "2026-09-02T09:11:00Z" },
  { id: 1, category: "strength", body: "正手很重", created_at: "2026-08-28T20:03:00Z" },
];

afterEach(() => {});

describe("NotesPopover", () => {
  it("opens on click and renders the notes in the given order, read-only", () => {
    render(
      <NotesPopover notes={NOTES} label="测试球员 · 评价">
        <span>评</span>
      </NotesPopover>,
    );

    // Closed initially: no timeline yet.
    expect(screen.queryByRole("list", { name: "评价时间线" })).toBeNull();

    fireEvent.click(screen.getByRole("button"));

    const list = screen.getByRole("list", { name: "评价时间线" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    // Order preserved (caller passes newest-first): partner, weakness, strength.
    expect(within(items[0]).getByText("适合搭档")).toBeTruthy();
    expect(within(items[0]).getByText("和 X 搭配好")).toBeTruthy();
    expect(within(items[1]).getByText("弱点")).toBeTruthy();
    expect(within(items[2]).getByText("优点")).toBeTruthy();

    // Read-only: no append/delete controls.
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
  });

  it("is keyboard/触屏 reachable — the trigger is a real button", () => {
    render(
      <NotesPopover notes={NOTES} label="x">
        <span>评</span>
      </NotesPopover>,
    );
    const trigger = screen.getByRole("button");
    expect(trigger.tagName).toBe("BUTTON");
  });
});
