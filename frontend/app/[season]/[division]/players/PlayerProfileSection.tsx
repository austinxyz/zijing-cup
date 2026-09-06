"use client";

import { useState, useTransition } from "react";

import type { Player } from "@/lib/api";
import { profileUrl } from "@/lib/utr";
import { usePlayerEdit } from "./PlayerEditContext";

const TAG =
  "inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] leading-relaxed text-muted";

function genderLabel(g: string | null): string {
  return g === "M" ? "男" : g === "F" ? "女" : "—";
}

function ReadField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-muted">{label}</span>
      <div className="flex h-8 items-center rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground">
        {children}
      </div>
    </div>
  );
}

/**
 * 基本信息 section. Read-only by default; in edit mode the four identity fields
 * (姓/名/性别/UTR 链接) become editable and save via the server action. The
 * current singles/doubles UTR stay read-only here — they are maintained on the
 * team page, where the doubles write carries the participation-mirror guardrail.
 */
export function PlayerProfileSection({
  player,
  season,
  division,
  saveAction,
}: {
  player: Player;
  season: string;
  division: string;
  saveAction: (
    season: string,
    division: string,
    playerId: number,
    fields: {
      last_name: string;
      first_name: string;
      gender: string;
      utr_profile_id: string;
    },
  ) => Promise<void>;
}) {
  const { canEdit, editing } = usePlayerEdit();
  const [last, setLast] = useState(player.last_name);
  const [first, setFirst] = useState(player.first_name);
  const [gender, setGender] = useState(player.gender ?? "");
  const [utr, setUtr] = useState(player.utr_profile_id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const showForm = canEdit && editing;

  return (
    <section
      aria-label="基本信息"
      className="flex flex-none flex-col rounded-token border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
        <span>基本信息</span>
        <span className={TAG}>跨赛季，与队伍无关</span>
      </div>

      {showForm ? (
        <div className="flex flex-col gap-3 px-3.5 py-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">
              姓
              <input
                aria-label="姓"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                className="h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">
              名
              <input
                aria-label="名"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                className="h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">
              性别
              <select
                aria-label="性别（编辑）"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="h-8 rounded-token border border-border bg-surface px-2 text-[12.5px] text-foreground"
              >
                <option value="">未填</option>
                <option value="M">男</option>
                <option value="F">女</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] text-muted">
              UTR 链接 id
              <input
                aria-label="UTR 链接 id"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                className="h-8 rounded-token border border-border bg-surface px-2.5 font-mono text-[12px] text-foreground"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending || last.trim() === "" || first.trim() === ""}
              onClick={() => {
                setMsg(null);
                setErr(null);
                start(async () => {
                  try {
                    await saveAction(season, division, player.id, {
                      last_name: last,
                      first_name: first,
                      gender,
                      utr_profile_id: utr,
                    });
                    setMsg("已保存");
                  } catch {
                    setErr("保存失败——请重试");
                  }
                });
              }}
              className="min-h-9 rounded-token bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50"
            >
              {pending ? "保存中…" : "保存资料"}
            </button>
            {msg ? <span className="text-[12px] text-success">{msg}</span> : null}
            {err ? (
              <span role="alert" className="text-[12px] text-danger">
                {err}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            当前单/双打 UTR 在队伍页维护（双打写入会联动参赛 UTR，受赛季锁保护），这里不改。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 px-3.5 py-3">
          <ReadField label="姓">{player.last_name}</ReadField>
          <ReadField label="名">{player.first_name}</ReadField>
          <ReadField label="性别">{genderLabel(player.gender)}</ReadField>
          <ReadField label="UTR 链接">
            {player.utr_profile_id ? (
              <a
                href={profileUrl(player.utr_profile_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11.5px] text-primary underline"
              >
                …/profiles/{player.utr_profile_id}
              </a>
            ) : (
              <span className="text-muted-foreground">未填</span>
            )}
          </ReadField>
          <ReadField label="当前单打 UTR">
            <span className="font-mono">{player.singles_utr ?? "—"}</span>
          </ReadField>
          <ReadField label="单打状态">{player.singles_status ?? "—"}</ReadField>
          <ReadField label="当前双打 UTR">
            <span className="font-mono">{player.doubles_utr ?? "—"}</span>
          </ReadField>
          <ReadField label="双打状态">{player.doubles_status ?? "—"}</ReadField>
        </div>
      )}
    </section>
  );
}
