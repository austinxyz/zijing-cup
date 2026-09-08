import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("NotesPopover editable", () => {
  const two: PlayerNote[] = [
    { id: 2, category: "weakness", body: "反手弱", created_at: "2026-09-02T09:00:00Z" },
    { id: 1, category: "strength", body: "正手重", created_at: "2026-08-28T09:00:00Z" },
  ];

  it("renders an append form + per-note delete when edit is passed", () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <NotesPopover notes={two} label="x · 评价" edit={{ onAdd, onDelete }}>
        <span>评</span>
      </NotesPopover>,
    );
    fireEvent.click(screen.getByRole("button", { name: "评" }));

    expect(screen.getByRole("combobox", { name: "评价类别" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "评价内容" })).toBeTruthy();
    const add = screen.getByRole("button", { name: "追加" });
    expect((add as HTMLButtonElement).disabled).toBe(true); // empty body

    fireEvent.change(screen.getByRole("textbox", { name: "评价内容" }), {
      target: { value: "网前果断" },
    });
    expect((add as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(add);
    expect(onAdd).toHaveBeenCalledWith("strength", "网前果断");

    // per-note delete with inline confirm
    const list = screen.getByRole("list", { name: "评价时间线" });
    const firstDelete = within(list).getAllByRole("button", { name: "删除" })[0];
    fireEvent.click(firstDelete);
    fireEvent.click(within(list).getByRole("button", { name: "确认" }));
    expect(onDelete).toHaveBeenCalledWith(2);
  });

  it("stays read-only (no form, no delete) when edit is absent", () => {
    render(
      <NotesPopover notes={two} label="x · 评价">
        <span>评</span>
      </NotesPopover>,
    );
    fireEvent.click(screen.getByRole("button", { name: "评" }));
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "评价内容" })).toBeNull();
  });
});

describe("NotesPopover hover dismissal", () => {
  it("opens on hover and closes when the pointer leaves (no stacking)", () => {
    vi.useFakeTimers();
    try {
      render(
        <NotesPopover notes={NOTES} label="x · 评价">
          <span>评</span>
        </NotesPopover>,
      );
      const trigger = screen.getByRole("button", { name: "评" });
      fireEvent.mouseEnter(trigger);
      expect(screen.getByRole("dialog", { name: "x · 评价" })).toBeTruthy();

      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByRole("dialog", { name: "x · 评价" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("NotesPopover editable is click-only (stable for typing on touch)", () => {
  const edit = { onAdd: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined) };

  it("does NOT open on hover when editable (touch fires emulated mouseenter)", () => {
    render(
      <NotesPopover notes={[]} label="x · 评价" edit={edit}>
        <span>评</span>
      </NotesPopover>,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "评" }));
    expect(screen.queryByRole("dialog", { name: "x · 评价" })).toBeNull();
  });

  it("opens on click and stays open when the pointer leaves (typing won't dismiss it)", () => {
    vi.useFakeTimers();
    try {
      render(
        <NotesPopover notes={[]} label="x · 评价" edit={edit}>
          <span>评</span>
        </NotesPopover>,
      );
      const trigger = screen.getByRole("button", { name: "评" });
      fireEvent.click(trigger);
      expect(screen.getByRole("dialog", { name: "x · 评价" })).toBeTruthy();
      fireEvent.mouseLeave(trigger);
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByRole("dialog", { name: "x · 评价" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
