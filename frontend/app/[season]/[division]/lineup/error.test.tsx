import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LineupIndexError from "./error";

describe("lineup picker error boundary", () => {
  it("explains the cold start and offers a retry", () => {
    render(<LineupIndexError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByText("无法加载球队列表")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("does not put the raw error message on screen", () => {
    render(<LineupIndexError error={new Error("boom")} reset={() => {}} />);

    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it("retries through the boundary's own reset", () => {
    const reset = vi.fn();
    render(<LineupIndexError error={new Error("boom")} reset={reset} />);

    screen.getByRole("button", { name: "重试" }).click();

    expect(reset).toHaveBeenCalled();
  });
});
