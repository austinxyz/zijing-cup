import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LineupComment } from "@/lib/api";
import { LineupComments } from "./LineupComments";

function comment(over: Partial<LineupComment> = {}): LineupComment {
  return {
    id: 1,
    body: "打 THU 用这套",
    created_at: "2026-09-07T15:40:00Z",
    ...over,
  };
}

describe("LineupComments count + collapse", () => {
  it("shows the comment count folded, expands on click", () => {
    render(<LineupComments comments={[comment(), comment({ id: 2 })]} editable={false} />);
    const toggle = screen.getByRole("button", { name: /评论/ });
    // Count is visible while folded.
    expect(toggle.textContent).toContain("2");
    // Timeline hidden until expanded.
    expect(screen.queryByText("打 THU 用这套")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getAllByText("打 THU 用这套").length).toBeGreaterThan(0);
  });

  it("shows zero when there are no comments", () => {
    render(<LineupComments comments={[]} editable={false} />);
    const toggle = screen.getByRole("button", { name: /评论/ });
    expect(toggle.textContent).toContain("0");
  });
});

describe("LineupComments view mode (read-only)", () => {
  it("expanded view mode shows the timeline newest-first, no form, no delete", () => {
    render(
      <LineupComments
        comments={[
          comment({ id: 1, body: "旧", created_at: "2026-09-01T00:00:00Z" }),
          comment({ id: 2, body: "新", created_at: "2026-09-07T00:00:00Z" }),
        ]}
        editable={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));
    // No append form.
    expect(screen.queryByPlaceholderText(/写一条评论/)).toBeNull();
    // No delete controls.
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
    // Both comments render.
    expect(screen.getByText("旧")).toBeTruthy();
    expect(screen.getByText("新")).toBeTruthy();
  });
});

describe("LineupComments edit mode", () => {
  it("shows the append form; 追加 disabled until text is entered", () => {
    render(
      <LineupComments comments={[]} editable onAdd={vi.fn()} onDelete={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));
    const box = screen.getByPlaceholderText(/写一条评论/);
    const add = screen.getByRole("button", { name: "追加" });
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(box, { target: { value: "D2 偏弱盯紧" } });
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });

  it("calls onAdd with the typed body", async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<LineupComments comments={[]} editable onAdd={onAdd} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));
    fireEvent.change(screen.getByPlaceholderText(/写一条评论/), {
      target: { value: "打 THU 用这套" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(onAdd).toHaveBeenCalledWith("打 THU 用这套");
  });

  it("delete asks for inline confirmation, then calls onDelete", () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <LineupComments comments={[comment({ id: 7 })]} editable onAdd={vi.fn()} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /评论/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    // Not deleted yet — confirmation shown.
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});
