"use client";

import { useState, useTransition } from "react";

import {
  addExistingPlayerToTeam,
  createAndAddPlayer,
  searchPlayersForAdd,
  type PlayerSearchHit,
} from "./actions";

function gtoken(g: string | null): string {
  return g === "M" ? "♂" : g === "F" ? "♀" : "·";
}
function errText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "操作失败——请重试";
}

/**
 * Edit-mode "add a player to this team" control. Two ways in: search the whole
 * registry by name and add an existing person, or (when nobody matches) create
 * a brand-new person and add them. Both go through the group-1 server actions,
 * which are scoped to this competition; on success the route re-renders (the
 * server action revalidates), so the roster shows the new member with no local
 * state to drift. Backend refusals (already on team / season locked) surface
 * inline rather than vanishing.
 */
export function AddPlayerControl({
  season,
  division,
  teamId,
}: {
  season: string;
  division: string;
  teamId: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchHit[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [last, setLast] = useState("");
  const [first, setFirst] = useState("");
  const [gender, setGender] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const field =
    "h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px]";

  function runSearch() {
    setErr(null);
    start(async () => {
      try {
        setResults(await searchPlayersForAdd(query));
      } catch (e) {
        setErr(errText(e));
      }
    });
  }

  function addExisting(id: number) {
    setErr(null);
    start(async () => {
      try {
        await addExistingPlayerToTeam(season, division, teamId, id);
        setResults(null);
        setQuery("");
      } catch (e) {
        setErr(errText(e));
      }
    });
  }

  function createNew() {
    setErr(null);
    start(async () => {
      try {
        await createAndAddPlayer(season, division, teamId, {
          last_name: last,
          first_name: first,
          gender,
        });
        setNewOpen(false);
        setLast(""); setFirst(""); setGender("");
        setResults(null); setQuery("");
      } catch (e) {
        setErr(errText(e));
      }
    });
  }

  return (
    <div className="flex flex-none flex-col gap-2 border-b border-border bg-surface-muted px-[22px] py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[12.5px] font-medium text-foreground">加入队员</span>
        <input
          aria-label="加入队员搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输姓名搜索…（如 Hu / 胡）"
          className={`${field} flex-1`}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={pending || query.trim() === ""}
          className="h-8 rounded-token border border-border bg-surface px-3 text-[12.5px] disabled:opacity-50"
        >
          搜索
        </button>
        <button
          type="button"
          onClick={() => setNewOpen((v) => !v)}
          className="h-8 rounded-token border border-border bg-surface px-3 text-[12.5px]"
        >
          + 新建队员
        </button>
      </div>

      {results !== null ? (
        results.length > 0 ? (
          <ul className="max-h-[150px] overflow-auto rounded-token border border-border bg-surface">
            {results.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border-b border-border px-2.5 py-1.5 text-[12.5px] last:border-b-0"
              >
                <span>
                  {p.last_name} {p.first_name}{" "}
                  <span
                    className={
                      p.gender === "M"
                        ? "text-[#1f5fd0]"
                        : p.gender === "F"
                          ? "text-[#ab237f]"
                          : "text-muted-foreground"
                    }
                  >
                    {gtoken(p.gender)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => addExisting(p.id)}
                  disabled={pending}
                  className="h-7 rounded-token bg-primary px-2.5 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  加入本队
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-token border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground">
            没有匹配「{query}」的队员——可「+ 新建队员」。
          </div>
        )
      ) : null}

      {newOpen ? (
        <div className="flex flex-col gap-2 rounded-token border border-dashed border-border bg-surface p-2.5">
          <div className="flex gap-2">
            <input aria-label="新建-姓" value={last} onChange={(e) => setLast(e.target.value)} placeholder="姓" className={`${field} flex-1`} />
            <input aria-label="新建-名" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="名" className={`${field} flex-1`} />
            <select aria-label="新建-性别" value={gender} onChange={(e) => setGender(e.target.value)} className={`${field} w-[84px]`}>
              <option value="">性别</option>
              <option value="M">男</option>
              <option value="F">女</option>
            </select>
          </div>
          <button
            type="button"
            onClick={createNew}
            disabled={pending || last.trim() === "" || first.trim() === ""}
            className="h-8 self-start rounded-token bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            新建并加入本队
          </button>
        </div>
      ) : null}

      {err ? (
        <span role="alert" className="text-[12px] text-danger">
          {err}
        </span>
      ) : null}
    </div>
  );
}
