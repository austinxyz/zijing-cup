import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getSeasons } from "@/lib/api";
import Layout from "./layout";
import RulesError from "./rules/error";

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

    expect(screen.getByText("赛制规则")).toBeInTheDocument();
    expect(screen.getByText("2026 · 银组")).toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeInTheDocument();
  });

  it("still renders the shell when the season list cannot be fetched", async () => {
    // The shell must survive a backend outage: it lives above error.tsx
    // precisely so a failed fetch replaces the page, not the whole window.
    vi.mocked(getSeasons).mockRejectedValue(new Error("backend down"));

    render(await Layout(layoutProps(<p>页面内容</p>)));

    expect(screen.getByText("赛制规则")).toBeInTheDocument();
    // Falls back to the URL's own values rather than inventing a division
    // name it does not have.
    expect(screen.getByText("2026 · silver")).toBeInTheDocument();
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
