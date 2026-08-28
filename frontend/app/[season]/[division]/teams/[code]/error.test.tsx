import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RosterError from "./error";

describe("roster error boundary", () => {
  it("explains the cold start and offers a retry", () => {
    render(<RosterError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByText("无法加载名单")).toBeTruthy();
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
  });

  it("does not put the raw error message on screen", () => {
    // The message is a server-side detail; a captain reading "boom" learns
    // nothing and the page looks broken rather than temporarily unavailable.
    render(<RosterError error={new Error("boom")} reset={() => {}} />);

    expect(screen.queryByText(/boom/)).toBeNull();
  });

  it("retries through the boundary's own reset", () => {
    const reset = vi.fn();
    render(<RosterError error={new Error("boom")} reset={reset} />);

    screen.getByRole("button", { name: "重试" }).click();

    expect(reset).toHaveBeenCalled();
  });

  it("points at the team list as the other way out", () => {
    render(<RosterError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByText(/从左侧换一支球队/)).toBeTruthy();
  });
});
