import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchRecord } from "@/lib/api";
import { MatchHistory } from "./MatchHistory";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

const TEAMS = [
  { code: "UCSD-ZJU", display_name: "交大" },
  { code: "THU-MIT", display_name: "清华" },
  { code: "PKU-X", display_name: "北大" },
];

function rec(id: number, our: string, opp: string, win: number, loss: number): MatchRecord {
  return {
    id, our_team_code: our, opponent_team_code: opp,
    match_date: "2026-09-28", round_label: "小组赛第2轮", source_lineup_id: null,
    lines: {
      D1: {
        our: ["p1", "p2"], opp: [11, null], outcome: "win", note: "抢七险胜",
        our_players: [
          { key: "p1", player_id: 1, last_name: "Chen", first_name: "Yilun", gender: "M" },
          { key: "p2", player_id: 2, last_name: "Wu", first_name: "Qiang", gender: "M" },
        ],
        opp_players: [
          { player_id: 11, last_name: "Li", first_name: "Ming", gender: "M" },
          null,
        ],
      },
    },
    outcome: { our: win, opponent: loss, scoring_mode: "match_count" },
    created_at: null, updated_at: null,
  };
}

afterEach(() => vi.clearAllMocks());

const NOOP = async () => {};

describe("MatchHistory", () => {
  it("lists a row with opponent and whole-tie result", () => {
    render(<MatchHistory season="2026" division="silver" teams={TEAMS}
      matches={[rec(1, "UCSD-ZJU", "THU-MIT", 3, 2)]} canEdit onDelete={NOOP} />);
    expect(screen.getByText(/胜 3[–-]2/)).toBeTruthy();
  });

  it("filters by team", () => {
    render(<MatchHistory season="2026" division="silver" teams={TEAMS} matches={[
      rec(1, "UCSD-ZJU", "THU-MIT", 3, 2),
      rec(2, "PKU-X", "THU-MIT", 1, 4),
    ]} canEdit onDelete={NOOP} />);
    fireEvent.change(screen.getByLabelText("按队伍筛选"), { target: { value: "PKU-X" } });
    expect(document.querySelectorAll("details").length).toBe(1);
    expect(screen.getByText(/负 1[–-]4/)).toBeTruthy();
  });

  it("expands to show per-line detail with 未记录 for an unmatched opponent", () => {
    render(<MatchHistory season="2026" division="silver" teams={TEAMS}
      matches={[rec(1, "UCSD-ZJU", "THU-MIT", 3, 2)]} canEdit onDelete={NOOP} />);
    fireEvent.click(screen.getByText("2026-09-28"));
    expect(screen.getByText(/Chen/)).toBeTruthy();
    expect(screen.getByText(/Li Ming|Li/)).toBeTruthy();
    expect(screen.getByText(/未记录/)).toBeTruthy();
    expect(screen.getByText(/抢七险胜/)).toBeTruthy();
  });

  it("shows the 录入比赛 entry link only when canEdit", () => {
    const { rerender } = render(<MatchHistory season="2026" division="silver" teams={TEAMS}
      matches={[]} canEdit onDelete={NOOP} />);
    expect(screen.getByText("录入比赛")).toBeTruthy();
    rerender(<MatchHistory season="2026" division="silver" teams={TEAMS}
      matches={[]} canEdit={false} onDelete={NOOP} />);
    expect(screen.queryByText("录入比赛")).toBeNull();
  });
});
