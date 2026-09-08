import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDivisionRules,
  getDivisionTeams,
  getSavedLineups,
  getTeamLineups,
  type SavedLineup,
} from "@/lib/api";
import { canEdit } from "@/lib/admin";
import Page from "./page";

vi.mock("@/lib/api", () => ({
  getDivisionTeams: vi.fn(),
  getDivisionRules: vi.fn(),
  getSavedLineups: vi.fn(),
  getTeamLineups: vi.fn(),
  getPlayerNotesBatch: vi.fn(async () => ({})),
}));
vi.mock("@/lib/admin", () => ({ canEdit: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  usePathname: () => "/2025/silver/compare",
  useSearchParams: () => new URLSearchParams(),
}));
// Stub the in-place unlock — its own behaviour is tested with the lineup change;
// here we only need the locked state to render without pulling server actions.
vi.mock("@/app/[season]/[division]/lineup/[code]/EditModeToggle", () => ({
  EditModeToggle: () => <div data-testid="unlock">编辑模式</div>,
}));

const TEAMS = [
  { code: "PKU", display_name: "北大", player_count: 10, men_count: 6, women_count: 4, unknown_gender_count: 0 },
  { code: "THU", display_name: "清华", player_count: 10, men_count: 6, women_count: 4, unknown_gender_count: 0 },
];
const RULES = { lines: [{ code: "D1", kind: "MD", sort_order: 0, cap: null, points: 1 }] } as never;

function teamLineups(prefix: string) {
  const p = (key: string, pid: number, last: string, first: string) => ({
    key, player_id: pid, last_name: last, first_name: first, gender: "M", match_utr: "7",
    origin: "frozen", origin_year: 2025, is_unresolved: false,
  });
  return {
    roster:
      prefix === "PKU"
        ? [p("PKUk1", 101, "Chen", "Yilun"), p("PKUk2", 102, "Hu", "Mitch")]
        : [p("THUk1", 201, "Li", "Ming"), p("THUk2", 202, "Wang", "Lei")],
  } as never;
}
function lineup(id: number, prefix: string, sum: string): SavedLineup {
  return {
    id, name: `${prefix}-L`, sort_order: 0,
    assignment: { D1: [`${prefix}k1`, `${prefix}k2`] },
    utr_snapshot: {}, status: "valid", violations: [], utr_diff: {}, missing: [],
    line_totals: { D1: { total: sum, cap: null, over: "0" } }, total: sum,
  } as SavedLineup;
}

function renderPage(query: Record<string, string> = {}) {
  return Page({
    params: Promise.resolve({ season: "2025", division: "silver" }),
    searchParams: Promise.resolve(query),
  });
}

afterEach(() => vi.clearAllMocks());

describe("compare page gate", () => {
  it("shows a locked state with an unlock prompt (not a redirect) when the viewer cannot edit", async () => {
    vi.mocked(canEdit).mockResolvedValue(false);
    render(await renderPage({ a: "PKU", al: "1", b: "THU", bl: "2" }));
    // Stays on the compare page with an unlock entry, and shows no saved-lineup
    // content (confidential).
    expect(screen.getByText(/管理员机密/)).toBeTruthy();
    expect(screen.getByTestId("unlock")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    // Confidential fetches are never made for a locked viewer.
    expect(getSavedLineups).not.toHaveBeenCalled();
    expect(getTeamLineups).not.toHaveBeenCalled();
  });
});

describe("compare page content", () => {
  it("shows a guide empty state when both sides are not chosen", async () => {
    vi.mocked(canEdit).mockResolvedValue(true);
    vi.mocked(getDivisionTeams).mockResolvedValue(TEAMS as never);
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getSavedLineups).mockResolvedValue([]);
    render(await renderPage());
    expect(screen.getByText(/选好两侧/)).toBeTruthy();
  });

  it("renders the line-by-line comparison when both sides are selected", async () => {
    vi.mocked(canEdit).mockResolvedValue(true);
    vi.mocked(getDivisionTeams).mockResolvedValue(TEAMS as never);
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getSavedLineups).mockImplementation(async (_y, _d, code) =>
      code === "PKU" ? [lineup(1, "PKU", "13.96")] : [lineup(2, "THU", "13.24")],
    );
    vi.mocked(getTeamLineups).mockImplementation(async (_y, _d, code) => teamLineups(code));

    render(await renderPage({ a: "PKU", al: "1", b: "THU", bl: "2" }));

    expect(screen.getByText("D1")).toBeTruthy();
    expect(screen.getByText(/Chen Yilun/)).toBeTruthy();
    expect(screen.getByText(/Li Ming/)).toBeTruthy();
    // diff mine - opp = 13.96 - 13.24 = +0.72, shown with sign + 2 decimals
    // (appears twice here: the single line's diff and the total diff)
    expect(screen.getAllByText(/\+0\.72/).length).toBeGreaterThan(0);
  });

  it("shows notes badges on BOTH sides when unlocked, and fetches them", async () => {
    const { getPlayerNotesBatch } = await import("@/lib/api");
    vi.mocked(canEdit).mockResolvedValue(true);
    vi.mocked(getDivisionTeams).mockResolvedValue(TEAMS as never);
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getSavedLineups).mockImplementation(async (_y, _d, code) =>
      code === "PKU" ? [lineup(1, "PKU", "13.96")] : [lineup(2, "THU", "13.24")],
    );
    vi.mocked(getTeamLineups).mockImplementation(async (_y, _d, code) => teamLineups(code));
    vi.mocked(getPlayerNotesBatch).mockResolvedValue({
      101: [{ id: 1, category: "weakness", body: "反手弱", created_at: "2026-09-02T09:00:00Z" }],
      201: [{ id: 2, category: "strength", body: "正手重", created_at: "2026-09-02T09:00:00Z" }],
    });

    render(await renderPage({ a: "PKU", al: "1", b: "THU", bl: "2" }));

    expect(getPlayerNotesBatch).toHaveBeenCalled();
    // Side A player 101 has a weakness; side B player 201 has a strength.
    expect(screen.getByText("弱点")).toBeTruthy();
    expect(screen.getByText("优点")).toBeTruthy();
  });
});

describe("compare notes stay read-only", () => {
  it("opening a notes badge shows no append form (read-only, no edit passed)", async () => {
    const { getPlayerNotesBatch } = await import("@/lib/api");
    vi.mocked(canEdit).mockResolvedValue(true);
    vi.mocked(getDivisionTeams).mockResolvedValue(TEAMS as never);
    vi.mocked(getDivisionRules).mockResolvedValue(RULES);
    vi.mocked(getSavedLineups).mockImplementation(async (_y, _d, code) =>
      code === "PKU" ? [lineup(1, "PKU", "13.96")] : [lineup(2, "THU", "13.24")],
    );
    vi.mocked(getTeamLineups).mockImplementation(async (_y, _d, code) => teamLineups(code));
    vi.mocked(getPlayerNotesBatch).mockResolvedValue({
      101: [{ id: 1, category: "weakness", body: "反手弱", created_at: "2026-09-02T09:00:00Z" }],
    });

    const { fireEvent } = await import("@testing-library/react");
    render(await renderPage({ a: "PKU", al: "1", b: "THU", bl: "2" }));
    fireEvent.click(screen.getAllByText("弱点")[0]);
    expect(screen.queryByRole("textbox", { name: "评价内容" })).toBeNull();
    expect(screen.queryByRole("button", { name: "追加" })).toBeNull();
  });
});
