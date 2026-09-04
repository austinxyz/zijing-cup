import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import type { LineupPlayer, SavedLineup } from "@/lib/api";
import { SavedLineups } from "./SavedLineups";

function player(key: string, first: string): LineupPlayer {
  return {
    key, last_name: "南", first_name: first, gender: "M",
    match_utr: "6.00", origin: "frozen", origin_year: 2025, is_unresolved: false,
  };
}

// Roster has p1..p4 — NOT p9 (departed).
const ROSTER = ["p1", "p2", "p3", "p4"].map((k, i) => player(k, `甲乙丙丁`[i]));

function saved(over: Partial<SavedLineup> = {}): SavedLineup {
  return {
    id: 1,
    name: "主力最强",
    assignment: { D1: ["p1", "p2"], D2: ["p3", "p4"] },
    utr_snapshot: {},
    status: "valid",
    violations: [],
    utr_diff: {},
    missing: [],
    ...over,
  };
}

function show(list: SavedLineup[], canEdit = false) {
  render(
    <SavedLineups
      saved={list}
      roster={ROSTER}
      canEdit={canEdit}
      basePath="/2026/silver/lineup/ZJU-USC"
    />,
  );
}

describe("SavedLineups per-line detail", () => {
  it("shows each player's UTR and gender, the line total, and team buffer", () => {
    show([
      saved({
        line_totals: {
          D1: { total: "12.80", cap: "13.00", over: "0" },
          D2: { total: "13.40", cap: "12.00", over: "1.40" },
        },
        total: "26.20",
        buffer_spent: "1.40",
        buffer_total: "0.50",
      }),
    ]);
    // a player's current UTR (roster match_utr is 6.00) is shown
    expect(screen.getAllByText(/6\.00/).length).toBeGreaterThan(0);
    // gender shows as a symbol (shared LineBlock), not a 男/女 word
    expect(screen.getAllByText("♂").length).toBeGreaterThan(0);
    // the D1 line total
    expect(screen.getByText(/12\.80/)).toBeTruthy();
    // over-cap amount on D2
    expect(screen.getByText(/超\s*1\.40/)).toBeTruthy();
    // team buffer usage
    expect(screen.getByText(/1\.40\s*\/\s*0\.50/)).toBeTruthy();
    // whole-lineup total beside the name, like a candidate card
    expect(screen.getByText(/总和\s*26\.20/)).toBeTruthy();
    // names read "姓 名" with a space (shared with candidate cards)
    expect(screen.getByText("南 甲")).toBeTruthy();
  });
});

describe("SavedLineups four states", () => {
  it("renders 仍合法 for a valid lineup", () => {
    show([saved()]);
    expect(screen.getByText("仍合法")).toBeTruthy();
  });

  it("renders UTR-moved with each mover named X→Y", () => {
    show([
      saved({
        status: "utr_moved",
        utr_diff: {
          p2: { name: "吴普强", snapshot: "5.60", current: "5.80" },
        },
      }),
    ]);
    expect(screen.getByText(/UTR 动了/)).toBeTruthy();
    const card = screen.getByText(/UTR 动了/).closest("article")!;
    expect(within(card).getByText(/吴普强/)).toBeTruthy();
    expect(within(card).getByText(/5\.60/)).toBeTruthy();
    expect(within(card).getByText(/5\.80/)).toBeTruthy();
  });

  it("renders 已非法 with the broken rule, driven by backend status not snapshot", () => {
    // utr_diff is empty on purpose: legality must come from status, never from
    // a snapshot comparison in the client.
    show([
      saved({
        status: "illegal",
        utr_diff: {},
        violations: [
          { code: "line_cap", line: "D1", amount: "0.30", message: "D1 超 cap 0.30" },
        ],
      }),
    ]);
    expect(screen.getByText("已非法")).toBeTruthy();
    expect(screen.getByText(/D1 超 cap 0\.30/)).toBeTruthy();
  });

  it("renders 有人离队 and names the affected seat", () => {
    show([
      saved({
        status: "player_gone",
        assignment: { D1: ["p1", "p9"], D2: ["p3", "p4"] },
        missing: ["p9"],
      }),
    ]);
    expect(screen.getByText("有人离队")).toBeTruthy();
    // the seat whose player left is called out (D1) in the warning strip
    expect(screen.getByText(/D1 座位的队员已不在名单/)).toBeTruthy();
  });
});

describe("SavedLineups unknown status fails closed", () => {
  it("shows a distinct 未知状态 badge, not 仍合法", () => {
    // A status this build does not know (a future backend value). It must not
    // fall through to 仍合法.
    show([saved({ status: "made_up" as unknown as SavedLineup["status"] })]);
    expect(screen.getByText("未知状态")).toBeTruthy();
    expect(screen.queryByText("仍合法")).toBeNull();
  });
});

describe("SavedLineups touch targets", () => {
  it("gives the edit control a ≥44px min height", () => {
    render(
      <SavedLineups saved={[saved()]} roster={ROSTER} canEdit
        basePath="/2026/silver/lineup/ZJU-USC"
        lineOrder={["D1", "D2"]}
        validateAction={vi.fn().mockResolvedValue([])}
        saveBackAction={vi.fn().mockResolvedValue(undefined)} />,
    );
    const edit = screen.getByRole("button", { name: /^编辑$/ });
    expect(edit.className).toContain("min-h-11");
  });
});

describe("SavedLineups in-place editor", () => {
  it("shows 编辑 only with the editor actions, and opens the editor on click", () => {
    // Without validate/saveBack actions, no editor entry even for an admin.
    const { rerender } = render(
      <SavedLineups saved={[saved()]} roster={ROSTER} canEdit
        basePath="/2026/silver/lineup/ZJU-USC" />,
    );
    expect(screen.queryByRole("button", { name: /编辑/ })).toBeNull();

    rerender(
      <SavedLineups saved={[saved()]} roster={ROSTER} canEdit
        basePath="/2026/silver/lineup/ZJU-USC"
        lineOrder={["D1", "D2"]}
        validateAction={vi.fn().mockResolvedValue([])}
        saveBackAction={vi.fn().mockResolvedValue(undefined)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^编辑$/ }));
    // The editor renders a select per seat.
    expect(screen.getAllByRole("combobox").length).toBeGreaterThan(0);
  });
});

describe("SavedLineups admin gating", () => {
  it("shows delete only to an admin", () => {
    const { rerender } = render(
      <SavedLineups saved={[saved()]} roster={ROSTER} canEdit={false}
        basePath="/2026/silver/lineup/ZJU-USC" />,
    );
    expect(screen.queryByRole("button", { name: /删除/ })).toBeNull();
    rerender(
      <SavedLineups saved={[saved()]} roster={ROSTER} canEdit={true}
        basePath="/2026/silver/lineup/ZJU-USC" deleteAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /删除/ })).toBeTruthy();
  });
});
