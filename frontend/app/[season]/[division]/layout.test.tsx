import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSeasons } from "@/lib/api";
import Layout from "./layout";
import RulesError from "./rules/error";

// The layout now asks whether an admin session exists. That reads a cookie,
// which needs a request scope this test does not have — and the session is not
// what these assertions are about.
vi.mock("@/lib/admin", () => ({ isSignedIn: vi.fn(async () => false) }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getSeasons: vi.fn() };
});

const SEASONS = [
  {
    year: 2026,
    edition_name: "第十一届",
    divisions: [
      { code: "gold", display_name: "金组" },
      { code: "silver", display_name: "银组" },
    ],
  },
];

afterEach(() => vi.clearAllMocks());

function layoutProps(children: React.ReactNode) {
  return {
    children,
    params: Promise.resolve({ season: "2026", division: "silver" }),
  };
}

describe("Division layout", () => {
  it("renders the shell around the page", async () => {
    vi.mocked(getSeasons).mockResolvedValue(SEASONS);

    render(await Layout(layoutProps(<p>页面内容</p>)));

    // Rendered in both shells now — the sidebar (hidden on mobile) and the top
    // bar (hidden on desktop). CSS shows one; the DOM holds both.
    expect(screen.getAllByText("赛制规则").length).toBeGreaterThanOrEqual(1);
    // Switcher label + its marked option, in each of the two shells.
    expect(screen.getAllByText("2026 · 银组")).toHaveLength(4);
    expect(screen.getByText("页面内容")).toBeInTheDocument();
  });

  it("still renders the shell when the season list cannot be fetched", async () => {
    // The shell must survive a backend outage: it lives above error.tsx
    // precisely so a failed fetch replaces the page, not the whole window.
    vi.mocked(getSeasons).mockRejectedValue(new Error("backend down"));

    render(await Layout(layoutProps(<p>页面内容</p>)));

    expect(screen.getAllByText("赛制规则").length).toBeGreaterThanOrEqual(1);
    // Falls back to the URL's own values rather than inventing a division
    // name. Only the summary in each shell — with no season list there are no
    // options to list, so twice (sidebar + top bar), not more.
    expect(screen.getAllByText("2026 · silver")).toHaveLength(2);
  });

  it("uses the dynamic-viewport height and drops the min-height on mobile", async () => {
    vi.mocked(getSeasons).mockResolvedValue(SEASONS);

    const { container } = render(await Layout(layoutProps(<p>页面内容</p>)));
    const shell = container.firstElementChild as HTMLElement;

    // 100vh over-counts on mobile (address bar retracted) and min-h-[640px]
    // exceeds a 667px screen once the top bar is subtracted — both push
    // content out under overflow-hidden with no scrollbar to show it.
    expect(shell.className).toMatch(/shell-height/);
    expect(shell.className).not.toMatch(/(^|\s)min-h-\[640px\]/);
    expect(shell.className).toMatch(/md:min-h-\[640px\]/);
    // Column on mobile (top bar over content), row on desktop (sidebar beside).
    expect(shell.className).toMatch(/flex-col/);
    expect(shell.className).toMatch(/md:flex-row/);
  });

  it("keeps the top bar out of any scroll container", async () => {
    vi.mocked(getSeasons).mockResolvedValue(SEASONS);

    const { container } = render(await Layout(layoutProps(<p>页面内容</p>)));
    const shell = container.firstElementChild as HTMLElement;
    const topBar = container.querySelector('[data-testid="top-bar"]');

    // The scroll lives below the top bar, never on a shared ancestor: put it
    // higher and the bar scrolls away with the content.
    expect(topBar).not.toBeNull();
    expect(topBar!.parentElement).toBe(shell);
  });

  it("rejects an unknown division code before fetching anything", async () => {
    vi.mocked(getSeasons).mockResolvedValue(SEASONS);

    // A URL naming a division that does not exist must not silently fall
    // back to the other one — it would render someone else's rules under the
    // wrong heading.
    await expect(
      Layout({
        children: null,
        params: Promise.resolve({ season: "2026", division: "bronze" }),
      }),
    ).rejects.toThrow();
  });
});

describe("Rules error state", () => {
  it("tells the reader the rules could not be loaded and offers a retry", () => {
    render(
      <RulesError error={new Error("boom")} reset={() => {}} />,
    );

    expect(screen.getByText(/无法加载赛制规则/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
