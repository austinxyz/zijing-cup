import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RosterPlayer, TeamRoster } from "@/lib/api";

const saveTeamEdits = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
vi.mock("./actions", () => ({ saveTeamEdits: (...a: any[]) => saveTeamEdits(...a), saveCurrentUtr: vi.fn() }));
// EditModeToggle pulls in server actions + router; stub it — its own behaviour
// is covered in the lineup change's tests.
vi.mock("@/app/[season]/[division]/lineup/[code]/EditModeToggle", () => ({
  EditModeToggle: ({ signedIn }: { signedIn: boolean }) => (
    <div data-testid="edit-toggle">{signedIn ? "已解锁" : "编辑模式"}</div>
  ),
}));

import { TeamEditPanel } from "./TeamEditPanel";
import { TeamEditProvider } from "./TeamEditContext";

function player(id: number, over: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    player_id: id, last_name: "南", first_name: `甲${id}`, gender: "M",
    match_utr: "6.0", origin: "frozen", origin_year: 2026, is_unresolved: false,
    under_appeal: false, dutr_status: null, rating_class: null, source_note: null,
    daily_utrs: [], singles_utr: null, singles_status: null, doubles_utr: null,
    doubles_status: null, is_borrowed_player: null, is_wildcard: null,
    representing_school: null, utr_profile_id: null, ...over,
  };
}

function roster(over: Partial<TeamRoster> = {}): TeamRoster {
  return {
    team: { id: 7, code: "T", display_name: null, season_year: 2026, division_code: "silver" },
    players: [player(1), player(2), player(3)],
    locked: false,
    school_count: 2,
    borrowed_limits: { "1": { roster_cap: 3, on_court_cap: 2 }, "2": { roster_cap: 2, on_court_cap: 1 } },
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

function show(props: { roster?: TeamRoster } = {}) {
  render(
    <TeamEditProvider canEdit initialEditing>
      <TeamEditPanel
        roster={props.roster ?? roster()}
        season="2026"
        division="silver"
        teamCode="T"
      />
    </TeamEditProvider>,
  );
}

describe("TeamEditPanel", () => {
  it("read-only when not editing: no editable inputs", () => {
    render(
      <TeamEditProvider canEdit={false}>
        <TeamEditPanel roster={roster()} season="2026" division="silver" teamCode="T" />
      </TeamEditProvider>,
    );
    expect(screen.queryByLabelText(/当前双打 /)).toBeNull();
  });

  it("batches multiple doubles edits into one save", async () => {
    show();
    fireEvent.change(screen.getByLabelText("当前双打 南 甲1"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("当前双打 南 甲2"), { target: { value: "6.2" } });
    fireEvent.click(screen.getByRole("button", { name: /保存 2 处改动/ }));
    expect(saveTeamEdits).toHaveBeenCalledTimes(1);
    const [, , , teamId, edits] = saveTeamEdits.mock.calls[0];
    expect(teamId).toBe(7);
    expect(edits.utrs).toHaveLength(2);
  });

  it("disables the school input when a player is marked borrowed", () => {
    show();
    fireEvent.click(screen.getByLabelText("外援 南 甲1"));
    expect((screen.getByLabelText("代表学校 南 甲1") as HTMLInputElement).disabled).toBe(true);
    // membership save clears the school for a borrowed player
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const edits = saveTeamEdits.mock.calls[0][4];
    const m = edits.memberships.find((x: { player_id: number }) => x.player_id === 1);
    expect(m.is_borrowed_player).toBe(true);
    expect(m.representing_school).toBeNull();
  });

  it("warns (but still allows save) when borrowed exceeds the roster cap", () => {
    // school_count 2 → roster_cap 2. Mark 3 borrowed → over.
    show();
    fireEvent.click(screen.getByLabelText("外援 南 甲1"));
    fireEvent.click(screen.getByLabelText("外援 南 甲2"));
    fireEvent.click(screen.getByLabelText("外援 南 甲3"));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/超名单外援上限/);
    // save is still enabled
    expect((screen.getByRole("button", { name: /保存/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves doubles status and UTR profile link, cleared fields as null", () => {
    show({ roster: roster({ players: [player(1, { doubles_utr: "6.0", utr_profile_id: "abc" })] }) });
    fireEvent.change(screen.getByLabelText("双打状态 南 甲1"), { target: { value: "projected" } });
    fireEvent.change(screen.getByLabelText("UTR 链接 南 甲1"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const edits = saveTeamEdits.mock.calls[0][4];
    expect(edits.utrs[0]).toEqual({
      player_id: 1,
      doubles_status: "projected",
      utr_profile_id: null,
    });
  });

  it("shows the caps for the chosen school count", () => {
    show();
    expect(screen.getByText(/名单 ≤2 · 每场 ≤1/)).toBeTruthy();
  });

  it("sends null (not '') for a cleared doubles field", async () => {
    show({ roster: roster({ players: [player(1, { doubles_utr: "6.0" })] }) });
    fireEvent.change(screen.getByLabelText("当前双打 南 甲1"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const edits = saveTeamEdits.mock.calls[0][4];
    expect(edits.utrs[0]).toEqual({ player_id: 1, doubles_utr: null });
  });

  it("keeps the edits and shows an error when the save fails", async () => {
    saveTeamEdits.mockRejectedValueOnce(new Error("boom"));
    show();
    fireEvent.change(screen.getByLabelText("当前双打 南 甲1"), { target: { value: "6.5" } });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    await screen.findByText(/保存失败/);
    // dirty state kept — the button still offers to save the change
    expect(screen.getByRole("button", { name: /保存 1 处改动/ })).toBeTruthy();
  });
});
