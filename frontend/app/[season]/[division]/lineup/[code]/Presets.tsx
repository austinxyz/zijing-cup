"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { LineupFilterPreset, LineupPlayer, RuleLine } from "@/lib/api";
import {
  buildLoadHref,
  presetSize,
  staleLockRefs,
  type StaleLockRef,
} from "./presetLoad";

const LINE_LABEL: Record<string, string> = {
  mens_doubles: "男双",
  womens_doubles: "女双",
  mixed_doubles: "混双",
};

function lineName(lines: RuleLine[], code: string): string {
  const line = lines.find((l) => l.code === code);
  const kind = line ? LINE_LABEL[line.kind] : undefined;
  return kind ? `${kind}（${code}）` : code;
}

interface PresetsProps {
  presets: LineupFilterPreset[];
  roster: LineupPlayer[];
  lines: RuleLine[];
  /** Admin: shows the save row and per-row delete. UI only — the real gate is
   *  the method-keyed middleware on the write routes. */
  canEdit: boolean;
  /** Whether the page currently has any lock or exclusion worth saving. */
  hasConstraints: boolean;
  basePath: string;
  /** Server actions, bound to (season,division,team) by the page. Absent in
   *  isolation (tests); the buttons still render. */
  saveAction?: (name: string) => Promise<void>;
  deleteAction?: (id: number) => Promise<void>;
}

export function Presets({
  presets,
  roster,
  lines,
  canEdit,
  hasConstraints,
  basePath,
  saveAction,
  deleteAction,
}: PresetsProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  //: The preset whose load was refused because a locked player is gone, and
  //: the dead references to show. Cleared when another action runs.
  const [stale, setStale] = useState<{ preset: LineupFilterPreset; refs: StaleLockRef[] } | null>(null);

  function load(preset: LineupFilterPreset) {
    const refs = staleLockRefs(preset, roster);
    if (refs.length > 0) {
      setStale({ preset, refs });
      return;
    }
    setStale(null);
    router.push(buildLoadHref(basePath, preset, roster));
  }

  return (
    <section
      aria-label="已存阵型"
      className="flex flex-col gap-3 rounded-token border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-foreground">
          已存阵型
          {canEdit ? (
            <span className="ml-1.5 rounded border border-border px-1 font-mono text-[9.5px] text-muted">
              admin 可存/删
            </span>
          ) : null}
        </span>
        <span className="text-[11.5px] leading-relaxed text-muted">
          载入会把这套锁定与排除写进地址栏，页面据此重搜；链接照样可分享。
        </span>
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {presets.map((preset) => {
            const size = presetSize(preset);
            return (
              <div
                key={preset.id}
                className="flex items-center gap-2.5 rounded-token border border-border px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                  {preset.name}
                </span>
                <span className="flex-none font-mono text-[10px] text-muted-foreground">
                  锁 {size.locks} · 排 {size.excluded}
                </span>
                <button
                  type="button"
                  onClick={() => load(preset)}
                  className="flex-none rounded-token bg-primary px-2.5 py-1 text-[12px] text-primary-foreground"
                >
                  载入
                </button>
                {canEdit && deleteAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      setStale(null);
                      void deleteAction(preset.id);
                    }}
                    className="flex-none rounded-token border border-danger-border bg-danger-surface px-2 py-1 text-[10px] text-danger"
                  >
                    删除
                  </button>
                ) : canEdit ? (
                  <button
                    type="button"
                    className="flex-none rounded-token border border-danger-border bg-danger-surface px-2 py-1 text-[10px] text-danger"
                  >
                    删除
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <span className="text-[12px] text-muted">还没有存过阵型。</span>
      )}

      {stale ? (
        <div
          aria-label="阵型已过期"
          className="flex flex-col gap-2 rounded-token border border-warning-border bg-warning-surface px-3 py-2.5"
        >
          <span className="text-[13px] font-semibold text-foreground">
            这个阵型已过期
          </span>
          <span className="text-[12px] leading-relaxed text-foreground">
            「{stale.preset.name}」锁定的一名队员已不在当前名单，无法照它布阵：
          </span>
          <ul className="flex flex-col gap-1">
            {stale.refs.map((ref, i) => (
              <li key={`${ref.line}-${ref.key}-${i}`} className="text-[12px] text-foreground">
                {lineName(lines, ref.line)} 锁定的一名队员（编号 {ref.key}）已不在名单。
              </li>
            ))}
          </ul>
          <span className="text-[11.5px] leading-relaxed text-muted-foreground">
            系统没有替你猜该换谁——按现有名单重排，或删掉这个过期的阵型。
          </span>
          <div className="flex flex-wrap gap-2">
            <a
              href={basePath}
              className="rounded-token border border-border px-2.5 py-1 text-[12px] text-foreground"
            >
              按现有名单重建
            </a>
            {canEdit && deleteAction ? (
              <button
                type="button"
                onClick={() => {
                  const id = stale.preset.id;
                  setStale(null);
                  void deleteAction(id);
                }}
                className="rounded-token border border-danger-border bg-danger-surface px-2.5 py-1 text-[12px] text-danger"
              >
                删除这个阵型
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="给当前锁定/排除起个名，存为阵型"
            aria-label="阵型名"
            className="h-9 min-w-0 flex-1 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
          />
          <button
            type="button"
            disabled={!hasConstraints || name.trim().length === 0}
            onClick={() => {
              if (!saveAction) return;
              const trimmed = name.trim();
              if (!trimmed || !hasConstraints) return;
              void saveAction(trimmed).then(() => setName(""));
            }}
            className="h-9 flex-none rounded-token border border-border bg-surface-muted px-3 text-[12px] text-foreground disabled:opacity-50"
          >
            存为阵型
          </button>
        </div>
      ) : null}
    </section>
  );
}
