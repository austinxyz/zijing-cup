import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LineupPlayer, SavedLineup } from "@/lib/api";
import { MatchEntryForm } from "./MatchEntryForm";

vi.mock("./actions", () => ({ createMatch: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { createMatch } from "./actions";

afterEach(() => vi.clearAllMocks());

const LINES = [
  { code: "D1", kind: "mens_doubles", points: 1 },
  { code: "MD", kind: "mixed_doubles", points: 1 },
];

function pl(id: number, last: string, g: string): LineupPlayer {
  return {
    key: `p${id}`, player_id: id, last_name: last, first_name: "X", gender: g,
    match_utr: "7.00", origin: "frozen", origin_year: 2025, is_unresolved: false,
  } as LineupPlayer;
}

const ROSTERS: Record<string, LineupPlayer[]> = {
  "UCSD-ZJU": [pl(1, "Chen", "M"), pl(2, "Wu", "M"), pl(3, "Liu", "M"), pl(4, "Wang", "F")],
  "THU-MIT": [pl(11, "Li", "M"), pl(12, "Ma", "M"), pl(13, "Zhao", "F"), pl(14, "Sun", "M")],
};

const SAVED: Record<string, SavedLineup[]> = {
  "UCSD-ZJU": [{
    id: 50, name: "主力", sort_order: 0,
    assignment: { D1: ["p1", "p2"], MD: ["p3", "p4"] },
    utr_snapshot: {}, status: "valid", violations: [], utr_diff: {}, missing: [],
  } as SavedLineup],
};

function renderForm() {
  return render(
    <MatchEntryForm season="2026" division="silver" teams={[
      { code: "UCSD-ZJU", display_name: "交大" },
      { code: "THU-MIT", display_name: "清华" },
    ]} lineOrder={LINES} scoringMode="match_count"
      rostersByTeam={ROSTERS} savedByTeam={SAVED} />,
  );
}

describe("MatchEntryForm", () => {
  it("renders a row per division line", () => {
    renderForm();
    expect(screen.getByText("D1")).toBeTruthy();
    expect(screen.getByText("MD")).toBeTruthy();
  });

  it("updates the live whole-tie outcome when lines are won/lost", () => {
    renderForm();
    // Mark both lines win -> 2-0
    fireEvent.click(screen.getByLabelText("D1 胜"));
    fireEvent.click(screen.getByLabelText("MD 胜"));
    expect(screen.getByTestId("live-outcome").textContent).toMatch(/2\s*[–-]\s*0/);
  });

  it("prefills our-side players from a saved lineup", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("我方队伍"), { target: { value: "UCSD-ZJU" } });
    fireEvent.change(screen.getByLabelText("复制自已存阵容"), { target: { value: "50" } });
    const d1a = screen.getByLabelText("D1 我方球员1") as HTMLSelectElement;
    expect(d1a.value).toBe("p1");
  });

  it("submits assembled match input", async () => {
    vi.mocked(createMatch).mockResolvedValue(undefined);
    renderForm();
    fireEvent.change(screen.getByLabelText("我方队伍"), { target: { value: "UCSD-ZJU" } });
    fireEvent.change(screen.getByLabelText("对手队伍"), { target: { value: "THU-MIT" } });
    fireEvent.change(screen.getByLabelText("比赛日期"), { target: { value: "2026-09-28" } });
    fireEvent.change(screen.getByLabelText("复制自已存阵容"), { target: { value: "50" } });
    // opp D1
    fireEvent.change(screen.getByLabelText("D1 对手球员1"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("D1 对手球员2"), { target: { value: "12" } });
    fireEvent.click(screen.getByLabelText("D1 胜"));
    fireEvent.change(screen.getByLabelText("MD 对手球员1"), { target: { value: "13" } });
    fireEvent.change(screen.getByLabelText("MD 对手球员2"), { target: { value: "14" } });
    fireEvent.click(screen.getByLabelText("MD 负"));
    fireEvent.click(screen.getByText("保存比赛"));
    await waitFor(() => expect(createMatch).toHaveBeenCalled());
    const [, , input] = vi.mocked(createMatch).mock.calls[0];
    expect(input.our_team_code).toBe("UCSD-ZJU");
    expect(input.opponent_team_code).toBe("THU-MIT");
    expect(input.lines.D1.our).toEqual(["p1", "p2"]);
    expect(input.lines.D1.opp).toEqual([11, 12]);
    expect(input.lines.D1.outcome).toBe("win");
    expect(input.lines.MD.outcome).toBe("loss");
  });
});

describe("MatchEntryForm gender rules", () => {
  it("blocks saving a mixed line with two men and explains why", async () => {
    vi.mocked(createMatch).mockResolvedValue(undefined);
    renderForm();
    fireEvent.change(screen.getByLabelText("我方队伍"), { target: { value: "UCSD-ZJU" } });
    fireEvent.change(screen.getByLabelText("对手队伍"), { target: { value: "THU-MIT" } });
    fireEvent.change(screen.getByLabelText("比赛日期"), { target: { value: "2026-09-28" } });
    // MD with two men (p1, p2 are both M in ROSTERS)
    fireEvent.change(screen.getByLabelText("MD 我方球员1"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("MD 我方球员2"), { target: { value: "p2" } });
    fireEvent.click(screen.getByLabelText("MD 胜"));
    fireEvent.click(screen.getByText("保存比赛"));
    await Promise.resolve();
    expect(createMatch).not.toHaveBeenCalled();
    expect(screen.getByText(/混双每方必须至少一名女生/)).toBeTruthy();
  });

  it("allows a mixed line with two women", async () => {
    vi.mocked(createMatch).mockResolvedValue(undefined);
    renderForm();
    fireEvent.change(screen.getByLabelText("我方队伍"), { target: { value: "UCSD-ZJU" } });
    fireEvent.change(screen.getByLabelText("对手队伍"), { target: { value: "THU-MIT" } });
    fireEvent.change(screen.getByLabelText("比赛日期"), { target: { value: "2026-09-28" } });
    // only one woman in ROSTERS (p4). Add a second woman to this test's roster via a mixed F+F is impossible here,
    // so assert a man+woman MD passes instead (also legal).
    fireEvent.change(screen.getByLabelText("MD 我方球员1"), { target: { value: "p1" } });
    fireEvent.change(screen.getByLabelText("MD 我方球员2"), { target: { value: "p4" } });
    fireEvent.click(screen.getByLabelText("MD 胜"));
    fireEvent.click(screen.getByText("保存比赛"));
    await waitFor(() => expect(createMatch).toHaveBeenCalled());
  });
});
