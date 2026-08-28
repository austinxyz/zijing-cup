import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelectedLayoutSegment } from "next/navigation";
import type { TeamSummary } from "@/lib/api";
import { SelectedTeamList } from "./SelectedTeamList";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: vi.fn(),
}));

const TEAMS: TeamSummary[] = [
  {
    code: "TEST-ALPHA",
    display_name: null,
    player_count: 2,
    men_count: 1,
    women_count: 1,
    unknown_gender_count: 0,
  },
  {
    code: "TEST-BETA",
    display_name: null,
    player_count: 3,
    men_count: 2,
    women_count: 1,
    unknown_gender_count: 0,
  },
];

function renderList() {
  return render(
    <SelectedTeamList season="2025" division="silver" teams={TEAMS} />,
  );
}

describe("SelectedTeamList", () => {
  afterEach(() => vi.clearAllMocks());

  it("marks the team named by the URL", () => {
    // The URL is the single source of truth for the selection. Reading it
    // from the route segment means a reload or a shared link lands on the
    // same team — component state could not promise that.
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("TEST-BETA");

    renderList();

    const beta = screen.getByRole("listitem", { name: "TEST-BETA" });
    expect(beta.getAttribute("aria-current")).toBe("true");
  });

  it("marks nothing on the index route", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(null);

    renderList();

    for (const item of screen.getAllByRole("listitem")) {
      expect(item.getAttribute("aria-current")).toBeNull();
    }
  });
});
