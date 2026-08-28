import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page";

describe("teams empty state", () => {
  it("asks the reader to pick a team", async () => {
    render(await Page());

    expect(screen.getByText("从左侧选一支球队")).toBeTruthy();
  });

  it("renders no roster table", async () => {
    // An empty table would read as "this team has no players", which is a
    // different and false claim — there is no team in question yet.
    render(await Page());

    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("参赛 UTR")).toBeNull();
  });
});
