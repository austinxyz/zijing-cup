import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RosterPlayer, TeamRoster } from "@/lib/api";

const saveTeamEdits = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
const removePlayerFromTeam = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
const searchPlayersForAdd = vi.fn<(...args: any[]) => Promise<any[]>>(async () => []);
const addExistingPlayerToTeam = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
const createAndAddPlayer = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
vi.mock("./actions", () => ({
  saveTeamEdits: (...a: any[]) => saveTeamEdits(...a),
  saveCurrentUtr: vi.fn(),
  removePlayerFromTeam: (...a: any[]) => removePlayerFromTeam(...a),
  searchPlayersForAdd: (...a: any[]) => searchPlayersForAdd(...a),
  addExistingPlayerToTeam: (...a: any[]) => addExistingPlayerToTeam(...a),
  createAndAddPlayer: (...a: any[]) => createAndAddPlayer(...a),
}));
const addPlayerNote = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
const deletePlayerNote = vi.fn<(...args: any[]) => Promise<void>>(async () => {});
vi.mock("@/app/[season]/[division]/players/actions", () => ({
  addPlayerNote: (...a: any[]) => addPlayerNote(...a),
  deletePlayerNote: (...a: any[]) => deletePlayerNote(...a),
}));
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
    representing_school: null, utr_profile_id: null, wins: null, losses: null, ...over,
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

function showWithNotes(opts: {
  editing: boolean;
  notesByPlayer?: Record<number, any[]>;
}) {
  render(
    <TeamEditProvider canEdit initialEditing={opts.editing}>
      <TeamEditPanel
        roster={roster()}
        season="2026"
        division="silver"
        teamCode="T"
        notesByPlayer={opts.notesByPlayer ?? {}}
      />
    </TeamEditProvider>,
  );
}

describe("TeamEditPanel — notes editing", () => {
  it("edit mode: a note-less player shows a 记评价 entry that opens an editable popover", () => {
    showWithNotes({ editing: true });
    const entries = screen.getAllByRole("button", { name: /记评价/ });
    expect(entries.length).toBeGreaterThan(0);
    fireEvent.click(entries[0]);
    expect(screen.getByRole("textbox", { name: "评价内容" })).toBeTruthy();
  });

  it("edit mode: a player with notes gets an editable popover (append form)", () => {
    showWithNotes({
      editing: true,
      notesByPlayer: {
        1: [{ id: 5, category: "weakness", body: "反手弱", created_at: "2026-09-02T09:00:00Z" }],
      },
    });
    // open the first weakness badge
    fireEvent.click(screen.getAllByText("弱点")[0]);
    expect(screen.getByRole("textbox", { name: "评价内容" })).toBeTruthy();
    // typing + 追加 calls addPlayerNote bound to (season, division, playerId=1)
    fireEvent.change(screen.getByRole("textbox", { name: "评价内容" }), {
      target: { value: "二发保守" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));
    expect(addPlayerNote).toHaveBeenCalledWith("2026", "silver", 1, "strength", "二发保守");
  });

  it("view mode: no 记评价 entry, notes read-only", () => {
    showWithNotes({
      editing: false,
      notesByPlayer: {
        1: [{ id: 5, category: "weakness", body: "反手弱", created_at: "2026-09-02T09:00:00Z" }],
      },
    });
    expect(screen.queryByRole("button", { name: /记评价/ })).toBeNull();
    // open the read-only badge → no append form
    fireEvent.click(screen.getAllByText("弱点")[0]);
    expect(screen.queryByRole("textbox", { name: "评价内容" })).toBeNull();
  });
});

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

  it("sends an edited participation UTR as a season-utr write", () => {
    show();
    fireEvent.change(screen.getByLabelText("参赛 UTR 南 甲1"), {
      target: { value: "6.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const edits = saveTeamEdits.mock.calls[0][4];
    expect(edits.seasonUtrs).toEqual([{ player_id: 1, value: "6.5" }]);
  });

  it("does not send an untouched participation UTR", () => {
    show();
    // Change only a doubles field; the participation UTR is left alone and must
    // not be written (so the doubles-mirror fallback still governs it).
    fireEvent.change(screen.getByLabelText("当前双打 南 甲1"), {
      target: { value: "6.2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
    const edits = saveTeamEdits.mock.calls[0][4];
    expect(edits.seasonUtrs ?? []).toEqual([]);
  });

  it("makes the participation UTR read-only when the season is locked", () => {
    show({ roster: roster({ locked: true }) });
    expect(
      (screen.getByLabelText("参赛 UTR 南 甲1") as HTMLInputElement).disabled,
    ).toBe(true);
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

describe("TeamEditPanel add / remove player", () => {
  it("shows the add-player control and a 新建 entry in edit mode", () => {
    show();
    expect(screen.getByLabelText("加入队员搜索")).toBeTruthy();
    expect(screen.getByRole("button", { name: /新建/ })).toBeTruthy();
  });

  it("shows a 移出 button on each roster row in edit mode", () => {
    show();
    expect(screen.getAllByRole("button", { name: "移出" }).length).toBe(3);
  });

  it("requires confirmation before removing, and cancel aborts", () => {
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "移出" })[0]);
    // inline confirm appears
    const confirm = screen.getByRole("button", { name: "确认移出" });
    expect(confirm).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(removePlayerFromTeam).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "确认移出" })).toBeNull();
  });

  it("removes with (season, division, teamId, playerId) after confirming", async () => {
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "移出" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "确认移出" }));
    expect(removePlayerFromTeam).toHaveBeenCalledWith("2026", "silver", 7, 1);
  });

  it("hides add and remove controls in view mode", () => {
    render(
      <TeamEditProvider canEdit initialEditing={false}>
        <TeamEditPanel roster={roster()} season="2026" division="silver" teamCode="T" />
      </TeamEditProvider>,
    );
    expect(screen.queryByLabelText("加入队员搜索")).toBeNull();
    expect(screen.queryByRole("button", { name: "移出" })).toBeNull();
  });
});

describe("TeamEditPanel add / remove errors surface inline", () => {
  it("shows the backend detail when a remove is refused (e.g. season locked)", async () => {
    removePlayerFromTeam.mockRejectedValueOnce(new Error("本赛季已锁定"));
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "移出" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "确认移出" }));
    expect(await screen.findByText(/本赛季已锁定/)).toBeTruthy();
  });

  it("shows the backend detail when an add is refused (e.g. already on team)", async () => {
    searchPlayersForAdd.mockResolvedValueOnce([
      { id: 9, last_name: "Hu", first_name: "Mitch", gender: "M" },
    ]);
    addExistingPlayerToTeam.mockRejectedValueOnce(new Error("已在本队"));
    show();
    fireEvent.change(screen.getByLabelText("加入队员搜索"), { target: { value: "Hu" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(await screen.findByRole("button", { name: "加入本队" }));
    expect(await screen.findByText(/已在本队/)).toBeTruthy();
  });
});
