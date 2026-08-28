import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import NotFound from "./not-found";

describe("team not-found", () => {
  it("says the team does not exist, not that it has no players", () => {
    render(<NotFound />);

    expect(screen.getByText("没有这支球队")).toBeTruthy();
    expect(screen.queryByText(/没有球员/)).toBeNull();
  });

  it("points at the team list as the way out", () => {
    // Next's default not-found replaces the whole window, taking the list
    // with it. Scoped here the list is still on screen, so the copy can send
    // the reader to it.
    render(<NotFound />);

    expect(screen.getByText(/从左侧选一支球队/)).toBeTruthy();
  });
});

describe("no loading boundary on this route", () => {
  it("has no loading.tsx", async () => {
    // A route-level Suspense boundary makes Next flush the response headers
    // before the page runs, so notFound() can no longer set a 404 — measured:
    // with loading.tsx an unknown team came back 200, without it 404. The
    // cold-start affordance it would buy belongs with an app-wide treatment,
    // not smuggled in here at the cost of a wrong status code.
    const { readdirSync } = await import("node:fs");
    const files = readdirSync("app/[season]/[division]/teams/[code]");

    expect(files).not.toContain("loading.tsx");
  });
});
