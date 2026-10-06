import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MatchRecord } from "@/lib/api";
import { CompareHistory } from "./CompareHistory";

function rec(
  id: number,
  our: number,
  oppScore: number,
  sourceLineupId: number | null = null,
): MatchRecord {
  return {
    id, our_team_code: "UCSD-ZJU", opponent_team_code: "THU-MIT",
    match_date: "2026-09-28", round_label: "小组赛第2轮",
    source_lineup_id: sourceLineupId,
    lines: {}, outcome: { our, opponent: oppScore, scoring_mode: "match_count" },
    created_at: null, updated_at: null,
  };
}

describe("CompareHistory", () => {
  it("lists prior ties vs the opponent with the win/loss tally", () => {
    render(<CompareHistory opponent="THU-MIT" lineupNames={{}} matches={[
      rec(1, 3, 2), rec(2, 2, 3),
    ]} />);
    expect(screen.getByText(/历史对局/)).toBeTruthy();
    expect(screen.getByText(/THU-MIT/)).toBeTruthy();
    expect(screen.getByText(/1\s*胜\s*1\s*负/)).toBeTruthy();
    expect(screen.getByText(/3[–-]2/)).toBeTruthy();
  });

  it("shows the lineup name when the source lineup resolves, — when it does not", () => {
    render(<CompareHistory opponent="THU-MIT" lineupNames={{ 50: "主力" }} matches={[
      rec(1, 3, 2, 50), // resolves to 主力
      rec(2, 1, 4, null), // ad-hoc, no source lineup
    ]} />);
    expect(screen.getByText("主力")).toBeTruthy();
    // The ad-hoc tie (null source) falls back to the team code, not a name.
    expect(screen.getByText("UCSD-ZJU")).toBeTruthy();
  });

  it("does not count a tie as a win (strict our > opp)", () => {
    render(<CompareHistory opponent="THU-MIT" lineupNames={{}} matches={[
      rec(1, 4, 4), // tie — neither win nor loss
      rec(2, 3, 2), // win
    ]} />);
    expect(screen.getByText(/1\s*胜\s*0\s*负/)).toBeTruthy();
  });

  it("shows an empty state when there is no recorded tie vs the opponent", () => {
    render(<CompareHistory opponent="ZJU-USC" lineupNames={{}} matches={[]} />);
    expect(screen.getByText(/还没.*录过.*比赛|没有/)).toBeTruthy();
  });
});
