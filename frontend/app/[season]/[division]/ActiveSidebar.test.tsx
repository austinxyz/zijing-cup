import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";
import { ActiveSidebar } from "./ActiveSidebar";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: vi.fn(),
  useSelectedLayoutSegments: vi.fn(() => []),
}));

const SEASONS = [
  {
    year: 2026,
    edition_name: "第十一届",
    divisions: [{ code: "silver", display_name: "银组" }],
  },
];

function renderSidebar() {
  return render(
    <ActiveSidebar
      season="2026"
      division="silver"
      divisionName="银组"
      seasons={SEASONS}
    />,
  );
}

describe("ActiveSidebar", () => {
  afterEach(() => vi.clearAllMocks());

  it("marks 队伍 when the URL is under the teams segment", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("teams");

    renderSidebar();

    expect(screen.getByText("队伍").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks 赛制规则 on the rules segment", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("rules");

    renderSidebar();

    expect(
      screen.getByText("赛制规则").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("falls back to 赛制规则 on the division index route", () => {
    // `/2026/silver` redirects to the rules page, so an unnamed segment is
    // the rules section rather than nothing being marked.
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(null);

    renderSidebar();

    expect(
      screen.getByText("赛制规则").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("ActiveSidebar on the lineup route", () => {
  it("marks 阵容 and points it at the team the URL names", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["lineup", "PKU"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("lineup");

    renderSidebar();

    expect(screen.getByText("阵容").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup/PKU",
    );
  });

  it("carries the team over from its roster, so 阵容 opens that team", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["teams", "THU-I"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("teams");

    renderSidebar();

    expect(screen.getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup/THU-I",
    );
  });

  it("falls back to the picker when the URL names no team", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["rules"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("rules");

    renderSidebar();

    expect(screen.getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup",
    );
  });
});
