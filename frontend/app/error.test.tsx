import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RootError from "./error";

describe("Root error boundary", () => {
  it("catches a failure on the redirect page instead of showing a bare crash", () => {
    // app/page.tsx throws when the season list cannot be fetched. Without a
    // boundary here that surfaces as Next's default error screen, which says
    // nothing about what went wrong or what to do.
    render(<RootError error={new Error("boom")} reset={() => {}} />);

    expect(screen.getByText(/无法连接后端/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
