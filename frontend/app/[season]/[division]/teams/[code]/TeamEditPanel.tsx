"use client";

import { useState, useTransition } from "react";

import type { RosterPlayer, TeamRoster } from "@/lib/api";
import { RosterTable } from "./RosterTable";
import { saveTeamEdits } from "./actions";
import { capsFor, borrowedCountWith, rosterOverCap } from "./teamEdit";
import { useTeamEdit } from "./TeamEditContext";

interface Props {
  roster: TeamRoster;
  season: string;
  division: string;
  teamCode: string;
}

/** "姓 名", the shared display form. */
function displayName(p: RosterPlayer): string {
  return `${p.last_name} ${p.first_name}`;
}

export function TeamEditPanel({ roster, season, division, teamCode }: Props) {
  const { canEdit, editing } = useTeamEdit();
  const players = roster.players;
  const [pending, startTransition] = useTransition();

  // Pending edits, keyed by player_id. Absent = unchanged.
  const [doubles, setDoubles] = useState<Record<number, string>>({});
  const [doublesStatus, setDoublesStatus] = useState<Record<number, string>>({});
  const [profileId, setProfileId] = useState<Record<number, string>>({});
  const [borrowed, setBorrowed] = useState<Record<number, boolean>>({});
  const [wildcard, setWildcard] = useState<Record<number, boolean>>({});
  const [schools, setSchools] = useState<Record<number, string>>({});
  const [schoolCount, setSchoolCount] = useState<number | null>(roster.school_count);
  const [error, setError] = useState<string | null>(null);

  const schoolCountChanged = schoolCount !== roster.school_count;
  const caps = capsFor(roster.borrowed_limits, schoolCount);
  const borrowedNow = borrowedCountWith(players, borrowed);
  const overCap = rosterOverCap(borrowedNow, caps);

  function isBorrowed(p: RosterPlayer): boolean {
    return p.player_id in borrowed ? borrowed[p.player_id] : p.is_borrowed_player === true;
  }
  function isWildcard(p: RosterPlayer): boolean {
    return p.player_id in wildcard ? wildcard[p.player_id] : p.is_wildcard === true;
  }
  function schoolOf(p: RosterPlayer): string {
    return p.player_id in schools ? schools[p.player_id] : p.representing_school ?? "";
  }

  // Player ids whose current-UTR fields (value / status / profile link) changed.
  const utrDirtyIds = new Set<number>([
    ...Object.keys(doubles).map(Number),
    ...Object.keys(doublesStatus).map(Number),
    ...Object.keys(profileId).map(Number),
  ]);

  const dirtyCount =
    utrDirtyIds.size +
    Object.keys(borrowed).length +
    Object.keys(wildcard).length +
    Object.keys(schools).length +
    (schoolCountChanged ? 1 : 0);

  function reset() {
    setDoubles({}); setDoublesStatus({}); setProfileId({});
    setBorrowed({}); setWildcard({}); setSchools({});
    setSchoolCount(roster.school_count);
  }

  function save() {
    const utrs = [...utrDirtyIds].map((id) => {
      const edit: {
        player_id: number;
        doubles_utr?: string | null;
        doubles_status?: string | null;
        utr_profile_id?: string | null;
      } = { player_id: id };
      // Only the fields actually changed for this player; a cleared value/link
      // sends null (clear it), never "" — an unparseable Decimal would 422 and,
      // all-or-nothing, sink the whole batch.
      if (id in doubles) edit.doubles_utr = doubles[id] === "" ? null : doubles[id];
      if (id in doublesStatus)
        edit.doubles_status = doublesStatus[id] === "" ? null : doublesStatus[id];
      if (id in profileId)
        edit.utr_profile_id = profileId[id] === "" ? null : profileId[id];
      return edit;
    });
    // A membership change collects whichever of the three fields changed for a
    // player; borrowed/wildcard true clears the school (server enforces this too).
    const ids = new Set<number>([
      ...Object.keys(borrowed).map(Number),
      ...Object.keys(wildcard).map(Number),
      ...Object.keys(schools).map(Number),
    ]);
    const memberships = [...ids].map((id) => {
      const p = players.find((x) => x.player_id === id)!;
      const b = isBorrowed(p);
      const w = isWildcard(p);
      return {
        player_id: id,
        is_borrowed_player: b,
        is_wildcard: w,
        representing_school: b || w ? null : schoolOf(p) || null,
      };
    });
    setError(null);
    startTransition(async () => {
      try {
        await saveTeamEdits(season, division, teamCode, roster.team.id, {
          utrs,
          memberships,
          ...(schoolCountChanged ? { schoolCount } : {}),
        });
        reset();
      } catch {
        // A failed write (bad value, season lock, lost auth) must not vanish:
        // keep the dirty edits so nothing is lost, and say so. reset() runs
        // only on success.
        setError("保存失败——请检查输入或重新解锁编辑后重试。");
      }
    });
  }

  // Read view: not unlocked, or unlocked but not currently editing. The unlock /
  // edit-view toggle lives in the team-name header (TeamEditHeaderControl). The
  // read table now also shows 外援 / 外卡 / 代表学校.
  if (!canEdit || !editing) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {roster.school_count != null ? (
          <div className="flex flex-none items-center gap-3 border-b border-border bg-surface px-[22px] py-1.5">
            <span className="font-mono text-[11.5px] text-muted-foreground">
              学校数 {roster.school_count}
            </span>
            {caps ? (
              <span className="font-mono text-[11.5px] text-muted">
                外援：名单 ≤{caps.roster_cap} · 每场 ≤{caps.on_court_cap}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto">
          <RosterTable players={players} canEdit={false} locked={roster.locked} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-border bg-surface px-[22px] py-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          学校数
          <input
            type="number"
            min={1}
            aria-label="学校数"
            value={schoolCount ?? ""}
            onChange={(e) =>
              setSchoolCount(e.target.value === "" ? null : Number(e.target.value))
            }
            className="h-8 w-14 rounded-token border border-border bg-surface px-2 font-mono text-[12.5px]"
          />
        </label>
        {caps ? (
          <span className="font-mono text-[11.5px] text-muted-foreground">
            外援：名单 ≤{caps.roster_cap} · 每场 ≤{caps.on_court_cap}
          </span>
        ) : (
          <span className="text-[11.5px] text-muted">未设学校数 · 外援上限不校验</span>
        )}
        {!roster.locked ? (
          <span className="text-[11.5px] text-warning">
            保存 rated 双打 UTR 会一并覆盖本赛季参赛 UTR（projected / unrated 不覆盖）
          </span>
        ) : null}
      </div>

      {/* Both axes scroll inside this box: the seven edit columns are wider
          than the team pane, so without overflow-x the last columns (外卡,
          代表学校) are silently clipped with no scrollbar. */}
      <div className="min-w-0 flex-1 overflow-auto">
        <table className="w-full min-w-[800px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {["队员", "性别", "参赛 UTR", "当前双打", "双打状态", "UTR 链接", "外援", "外卡", "代表学校"].map((h) => (
                <th
                  key={h}
                  className="sticky top-0 z-10 h-[34px] whitespace-nowrap border-b border-border bg-surface-muted px-3 text-left font-mono text-[11px] font-medium text-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const b = isBorrowed(p);
              const w = isWildcard(p);
              const external = b || w;
              const dChanged = p.player_id in doubles;
              return (
                <tr key={p.player_id} className={b ? "bg-borrowed-surface" : undefined}>
                  <td className="border-b border-border/60 px-3 py-1.5">{displayName(p)}</td>
                  <td className="border-b border-border/60 px-3 py-1.5">
                    {p.gender === "M" ? "♂" : p.gender === "F" ? "♀" : "—"}
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {p.match_utr ?? "—"}
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5">
                    <input
                      aria-label={`当前双打 ${displayName(p)}`}
                      value={p.player_id in doubles ? doubles[p.player_id] : p.doubles_utr ?? ""}
                      onChange={(e) =>
                        setDoubles((d) => ({ ...d, [p.player_id]: e.target.value }))
                      }
                      className={`h-8 w-[68px] rounded-token border px-2 font-mono text-[12px] ${
                        dChanged ? "border-primary bg-primary/5" : "border-border bg-surface"
                      }`}
                    />
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5">
                    <select
                      aria-label={`双打状态 ${displayName(p)}`}
                      value={
                        p.player_id in doublesStatus
                          ? doublesStatus[p.player_id]
                          : p.doubles_status ?? ""
                      }
                      onChange={(e) =>
                        setDoublesStatus((m) => ({ ...m, [p.player_id]: e.target.value }))
                      }
                      className="h-8 rounded-token border border-border bg-surface px-1 text-[12px]"
                    >
                      <option value="">—</option>
                      <option value="rated">rated</option>
                      <option value="projected">projected</option>
                      <option value="unrated">unrated</option>
                    </select>
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5">
                    <input
                      aria-label={`UTR 链接 ${displayName(p)}`}
                      value={
                        p.player_id in profileId
                          ? profileId[p.player_id]
                          : p.utr_profile_id ?? ""
                      }
                      placeholder="profile id"
                      onChange={(e) =>
                        setProfileId((m) => ({ ...m, [p.player_id]: e.target.value }))
                      }
                      className="h-8 w-24 rounded-token border border-border bg-surface px-2 font-mono text-[11px]"
                    />
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`外援 ${displayName(p)}`}
                      checked={b}
                      onChange={(e) =>
                        setBorrowed((m) => ({ ...m, [p.player_id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`外卡 ${displayName(p)}`}
                      checked={w}
                      onChange={(e) =>
                        setWildcard((m) => ({ ...m, [p.player_id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="border-b border-border/60 px-3 py-1.5">
                    <input
                      aria-label={`代表学校 ${displayName(p)}`}
                      disabled={external}
                      value={external ? "" : schoolOf(p)}
                      placeholder={external ? "—" : ""}
                      onChange={(e) =>
                        setSchools((m) => ({ ...m, [p.player_id]: e.target.value }))
                      }
                      className="h-8 w-24 rounded-token border border-border bg-surface px-2 text-[12px] disabled:bg-surface-muted disabled:text-muted"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-none flex-wrap items-center gap-3 border-t border-border bg-surface px-[22px] py-2.5">
        <button
          type="button"
          onClick={save}
          disabled={dirtyCount === 0 || pending}
          className="min-h-11 rounded-token bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
        >
          {pending ? "保存中…" : `保存 ${dirtyCount} 处改动`}
        </button>
        {dirtyCount > 0 ? (
          <button type="button" onClick={reset} className="min-h-11 rounded-token border border-border bg-surface px-3 py-2 text-[12.5px]">
            撤销
          </button>
        ) : null}
        {overCap ? (
          <span role="alert" className="text-[12px] text-warning">
            超名单外援上限（{borrowedNow} &gt; {caps?.roster_cap}）——仍可保存
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-[12px] text-danger">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
