import { render, screen, within } from "@testing-library/react";
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

/** The desktop sidebar (<aside>). Both shells render the same nav from the
 *  same derived section + teamCode, so proving it in one is enough — and it
 *  avoids the duplicate matches the two shells would otherwise produce. */
function sb() {
  return within(screen.getByRole("complementary"));
}

describe("ActiveSidebar", () => {
  afterEach(() => vi.clearAllMocks());

  it("marks 队伍 when the URL is under the teams segment", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("teams");

    renderSidebar();

    expect(sb().getByText("队伍").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks 赛制规则 on the rules segment", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("rules");

    renderSidebar();

    expect(
      sb().getByText("赛制规则").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
  });

  it("falls back to 赛制规则 on the division index route", () => {
    // `/2026/silver` redirects to the rules page, so an unnamed segment is
    // the rules section rather than nothing being marked.
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(null);

    renderSidebar();

    expect(
      sb().getByText("赛制规则").closest("[aria-current]"),
    ).toHaveAttribute("aria-current", "page");
  });
});

describe("ActiveSidebar on the lineup route", () => {
  it("marks 阵容 and points it at the team the URL names", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["lineup", "PKU"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("lineup");

    renderSidebar();

    expect(sb().getByText("阵容").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(sb().getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup/PKU",
    );
  });

  it("carries the team over from its roster, so 阵容 opens that team", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["teams", "THU-I"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("teams");

    renderSidebar();

    expect(sb().getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup/THU-I",
    );
  });

  it("falls back to the picker when the URL names no team", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["rules"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("rules");

    renderSidebar();

    expect(sb().getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup",
    );
  });
});

describe("ActiveSidebar on the admin routes", () => {
  it("marks 队员管理 when the URL is under it", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["players", "42"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("players");

    renderSidebar();

    expect(sb().getByText("队员管理").closest("[aria-current]")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mistake a player id for a team", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["players", "42"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("players");

    renderSidebar();

    // 阵容 takes the team in scope when there is one; a player id is not a
    // team code, and following it would 404.
    expect(sb().getByRole("link", { name: /阵容/ }).getAttribute("href")).toBe(
      "/2026/silver/lineup",
    );
  });

  it("passes the session through to the sidebar", () => {
    vi.mocked(useSelectedLayoutSegments).mockReturnValue(["rules"]);
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("rules");

    render(
      <ActiveSidebar
        season="2026"
        division="silver"
        divisionName="银组"
        seasons={SEASONS}
        signedIn
      />,
    );

    expect(screen.getByRole("button", { name: "登出" })).toBeTruthy();
  });
});
