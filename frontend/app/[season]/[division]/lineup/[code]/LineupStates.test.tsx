import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LineupPlayer, LineupSearch, RuleLine } from "@/lib/api";
import { NoSolution } from "./LineupStates";

const LINES: RuleLine[] = [
  { code: "D1", kind: "mens_doubles", sort_order: 1, cap: "13.00", points: 1 },
  { code: "MD", kind: "mixed_doubles", sort_order: 4, cap: "10.25", points: 1 },
  { code: "WD", kind: "womens_doubles", sort_order: 5, cap: "9.25", points: 1 },
];

function person(overrides: Partial<LineupPlayer> = {}): LineupPlayer {
  return {
    key: "w4",
    last_name: "西",
    first_name: "四",
    gender: "F",
    match_utr: "4.40",
    origin: "frozen",
    origin_year: 2025,
    is_unresolved: false,
    ...overrides,
  };
}

function search(overrides: Partial<LineupSearch> = {}): LineupSearch {
  return {
    candidates: [],
    ceiling: null,
    squads_at_ceiling: 0,
    squads_at_ceiling_exact: true,
    rules_ceiling: "13.50",
    infeasible_line: "WD",
    infeasibility: null,
    placements: {},
    truncated: false,
    borrowed_players_checked: false,
    invalid_locks: [],
    roster: [person()],
    missing_utr_count: 0,
    estimated_count: 0,
    unresolved_count: 0,
    ...overrides,
  };
}

describe("NoSolution reasons", () => {
  it("shows the structured reason and names the excluded/locked players", () => {
    render(
      <NoSolution
        search={search({
          infeasibility: {
            line: "WD",
            reasons: [
              {
                kind: "gender_shortage",
                message: "WD 需要 2 名女队员，当前可用只有 1 名",
                attributed: [
                  { name: "周乐言", where: "excluded" },
                  { name: "韩雨萌", where: "MD" },
                ],
              },
            ],
          },
        })}
        lines={LINES}
      />,
    );

    // The reason itself, not the bare "no legal partner" line.
    expect(screen.getByText(/需要 2 名女队员/)).toBeTruthy();
    // Named, with where each one went.
    expect(screen.getByText("周乐言")).toBeTruthy();
    expect(screen.getByText("排除")).toBeTruthy();
    expect(screen.getByText("韩雨萌")).toBeTruthy();
    expect(screen.getByText("已锁 MD")).toBeTruthy();

    // The gender_shortage reason rides the warning tier tokens.
    const reason = screen.getByText(/需要 2 名女队员/).closest("[data-reason]");
    expect(reason).not.toBeNull();
    expect(reason!.className).toMatch(/warning-surface/);

    // The no-blame disclaimer must survive.
    expect(
      screen.getByText(/不是逐条拆锁重算/),
    ).toBeTruthy();
  });

  it("shows eligibility on the neutral tier with no attribution chips", () => {
    render(
      <NoSolution
        search={search({
          infeasible_line: "D2",
          infeasibility: {
            line: "D2",
            reasons: [
              {
                kind: "eligibility",
                message:
                  "D2 够格的队员被上场资格限制挡在本线外：陈嘉禾（参赛 UTR 高于 6.0，按规则只能打 D1/MD）",
                attributed: [],
              },
            ],
          },
        })}
        lines={LINES}
      />,
    );

    const reason = screen.getByText(/资格限制挡在本线外/).closest("[data-reason]");
    expect(reason).not.toBeNull();
    // Neutral tier, not warning.
    expect(reason!.className).not.toMatch(/warning-surface/);
    expect(reason!.className).toMatch(/surface-muted/);
    // No attribution block for a rule-attribute reason.
    expect(within(reason as HTMLElement).queryByText("排除")).toBeNull();
    // Never phrased as the user's doing.
    expect(reason!.textContent ?? "").not.toContain("你");
  });
});

describe("NoSolution: pin-caused infeasibility", () => {
  it("renders the pin-named reason message", () => {
    render(
      <NoSolution
        search={search({
          infeasible_line: "MD",
          infeasibility: {
            line: "MD",
            reasons: [
              {
                kind: "over_cap",
                message:
                  "你把 陈嘉禾 钉在 MD，但与 陈嘉禾 能配的每个搭档，两人参赛 UTR 之和都超过 cap 10.25（含 buffer 0.5）",
                attributed: [],
              },
            ],
          },
        })}
        lines={LINES}
      />,
    );
    expect(screen.getByText(/你把 陈嘉禾 钉在 MD/)).toBeTruthy();
    expect(screen.getByText(/都超过 cap 10\.25/)).toBeTruthy();
  });
});
