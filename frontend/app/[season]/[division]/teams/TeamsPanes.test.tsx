import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSelectedLayoutSegment } from "next/navigation";
import { TeamsPanes } from "./TeamsPanes";

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

function panes() {
  return render(
    <TeamsPanes list={<div data-testid="list">列表</div>}>
      <div data-testid="content">名单</div>
    </TeamsPanes>,
  );
}

describe("TeamsPanes", () => {
  it("shows the list and hides the roster on mobile when no team is chosen", () => {
    // At /teams the child segment is null — no team selected.
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(null);

    panes();
    const list = screen.getByTestId("list").parentElement!;
    const content = screen.getByTestId("content").parentElement!;

    // Both visible on desktop (md:flex); on mobile only the list.
    expect(list.className).toMatch(/(^|\s)flex\b/);
    expect(list.className).toMatch(/md:flex/);
    expect(content.className).toMatch(/(^|\s)hidden\b/);
    expect(content.className).toMatch(/md:flex/);
  });

  it("shows the roster and hides the list on mobile when a team is chosen", () => {
    vi.mocked(useSelectedLayoutSegment).mockReturnValue("PKU");

    panes();
    const list = screen.getByTestId("list").parentElement!;
    const content = screen.getByTestId("content").parentElement!;

    expect(list.className).toMatch(/(^|\s)hidden\b/);
    expect(list.className).toMatch(/md:flex/);
    expect(content.className).toMatch(/(^|\s)flex\b/);
    expect(content.className).toMatch(/md:flex/);
  });

  it("does not branch on user-agent — visibility is CSS on one route", () => {
    // The panes never inspect navigator; the same DOM is served to every
    // device and the breakpoint decides. This asserts the mechanism is not a
    // device sniff by rendering without any UA and still getting both panes.
    vi.mocked(useSelectedLayoutSegment).mockReturnValue(null);
    panes();
    expect(screen.getByTestId("list")).toBeTruthy();
    expect(screen.getByTestId("content")).toBeTruthy();
  });
});
