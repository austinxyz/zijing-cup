import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import LineupError from "./error";

describe("lineup error boundary", () => {
  it("explains the cold start and offers a retry", () => {
    render(<LineupError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByText("无法搜索阵容")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("does not put the raw error message on screen", () => {
    // The message is a server-side detail; a captain reading "boom" learns
    // nothing and the page looks broken rather than temporarily unavailable.
    render(<LineupError error={new Error("boom")} reset={() => {}} />);

    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it("retries through the boundary's own reset", () => {
    const reset = vi.fn();
    render(<LineupError error={new Error("boom")} reset={reset} />);

    screen.getByRole("button", { name: "重试" }).click();

    expect(reset).toHaveBeenCalled();
  });

  it("does not claim the search found nothing", () => {
    render(<LineupError error={new Error("boom")} reset={() => {}} />);

    // A failed fetch is not a verdict about the roster. Saying anything like
    // "no lineup" here would be the same collapse the whole feature exists
    // to avoid — three real states, none of them "the request failed".
    expect(screen.queryByText(/凑不出|没有合法/)).toBeNull();
  });
});
