"use client";

import { useState, useTransition } from "react";

/** super-only: set/rotate one competition's admin password. The action hashes
 *  on the server and refuses unless the session is super. */
export function SuperPasswordForm({
  action,
}: {
  action: (season: string, division: string, password: string) => Promise<void>;
}) {
  const [season, setSeason] = useState("2026");
  const [division, setDivision] = useState("silver");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex max-w-md flex-col gap-3">
      <label className="flex flex-col gap-1 text-[13px] text-foreground">
        赛季
        <input
          aria-label="赛季"
          value={season}
          onChange={(e) => setSeason(e.target.value)}
          className="h-9 rounded-token border border-border bg-surface px-2.5 font-mono text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-foreground">
        组别
        <select
          aria-label="组别"
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className="h-9 rounded-token border border-border bg-surface px-2 text-[13px]"
        >
          <option value="silver">silver（银组）</option>
          <option value="gold">gold（金组）</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px] text-foreground">
        新密码
        <input
          type="password"
          aria-label="新密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 rounded-token border border-border bg-surface px-2.5 text-[13px]"
        />
      </label>
      <button
        type="button"
        disabled={pending || password.trim() === ""}
        onClick={() => {
          setMsg(null);
          setErr(null);
          start(async () => {
            try {
              await action(season, division, password);
              setPassword("");
              setMsg(`已为 ${season} ${division} 设置新密码。`);
            } catch {
              setErr("设置失败——请重试。");
            }
          });
        }}
        className="min-h-11 rounded-token bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? "设置中…" : "设置密码"}
      </button>
      {msg ? <p className="text-[12px] text-success">{msg}</p> : null}
      {err ? <p role="alert" className="text-[12px] text-danger">{err}</p> : null}
    </div>
  );
}
