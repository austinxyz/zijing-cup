"use client";

import type { PlayerChange, SheetDiff } from "./actions";

const FIELD_LABEL: Record<string, string> = {
  singles_utr: "单",
  singles_status: "单状态",
  doubles_utr: "双",
  doubles_status: "双状态",
  utr_profile_id: "链接",
};

/** The order the tally reads in, matching the sheet's own column order. */
const TALLY_FIELDS = [
  ["singles_utr", "当前单打"],
  ["singles_status", "单打状态"],
  ["doubles_utr", "当前双打"],
  ["doubles_status", "双打状态"],
  ["utr_profile_id", "UTR 链接"],
] as const;

function playerLabel(change: PlayerChange): string {
  return `${change.last_name}${change.first_name}`;
}

/**
 * Everything a write would do, before it does any of it.
 *
 * Grouped by person rather than laid out as a field-by-field table. That is
 * the narrower reading, and it costs the one thing a table gives for free:
 * columns line up, so a whole column pasted one place over is visible at a
 * glance. The per-field tally at the top puts that signal back in another
 * form — three doubles filled in should not produce twelve singles changes.
 */
export function UtrDiff({
  diff,
  onApply,
  onBack,
  pending = false,
}: {
  diff: SheetDiff;
  onApply: () => void;
  onBack: () => void;
  pending?: boolean;
}) {
  const doubled = Object.keys(diff.elsewhere).length > 0;
  const highest = Math.max(...Object.values(diff.counts), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        <div
          aria-label="按字段的改动数"
          className="mb-2.5 flex overflow-hidden rounded-token border border-border"
        >
          {TALLY_FIELDS.map(([field, label]) => {
            const count = diff.counts[field] ?? 0;
            // Flagged when this field carries the bulk of the changes and
            // there are enough of them to be a pattern rather than a typo.
            const suspicious = count >= 5 && count === highest;
            return (
              <div
                key={field}
                className={`flex-1 border-r border-border px-2.5 py-1.5 last:border-r-0 ${
                  suspicious ? "bg-warning-surface" : "bg-surface"
                }`}
              >
                <div
                  className={`font-mono text-[15px] ${
                    suspicious ? "text-warning" : "text-foreground"
                  }`}
                >
                  {count}
                </div>
                <div className="text-[10.5px] text-muted">{label}</div>
              </div>
            );
          })}
        </div>

        {diff.errors.length > 0 ? (
          <p className="mb-2 rounded-token border border-warning-border bg-warning-surface px-3 py-2 text-[12px] leading-relaxed text-warning">
            <strong>{diff.errors.length} 行被拒绝，这批一行都不会写入。</strong>{" "}
            整列错位时几乎每行都会被拒，放行一半只会让库里一半新一半旧。改完表再贴一次。
          </p>
        ) : null}

        {diff.not_covered > 0 ? (
          <p className="mb-2 rounded-token border border-border bg-surface-muted px-3 py-2 text-[12px] text-foreground">
            本表覆盖 {diff.covered} 人，队里另外 {diff.not_covered} 人未包含
          </p>
        ) : null}

        {doubled ? (
          <p className="mb-2 rounded-token border border-warning-border bg-warning-surface px-3 py-2 text-[12px] leading-relaxed text-warning">
            这批里有 {Object.keys(diff.elsewhere).length} 人<strong>也在别的组的名单上</strong>
            。当前 UTR 是这个人自己的属性，不按队也不按赛季 —— 改完那边看到的也是这个值。
          </p>
        ) : null}

        {diff.changes.length > 0 ? (
          <>
            <div className="mb-1 mt-3 text-[11px] font-medium text-muted">
              将写入（{diff.changes.length} 人）
            </div>
            {diff.changes.map((change) => (
              <div
                key={change.player_id}
                aria-label={playerLabel(change)}
                className="flex items-baseline gap-2 border-b border-[#eae7e0] py-1.5 text-[12px]"
              >
                <div className="w-[132px] flex-none">
                  {playerLabel(change)}
                  {diff.elsewhere[String(change.player_id)] ? (
                    <span className="ml-1.5 rounded border border-warning-border bg-warning-surface px-1 text-[10px] text-warning">
                      也在 {diff.elsewhere[String(change.player_id)].join("、")}
                    </span>
                  ) : null}
                </div>
                <div className="flex-1 font-mono">
                  {TALLY_FIELDS.map(([field]) => {
                    const changed = change.fields.find(
                      (f) => f.field === field,
                    );
                    return (
                      <span key={field} className="mr-4 inline-block">
                        <span className="mr-1 text-[10.5px] text-muted">
                          {FIELD_LABEL[field]}
                        </span>
                        {changed === undefined ? (
                          // Kept rather than omitted: without it the screen is
                          // all edits, and "only their doubles moved" is the
                          // fact worth reading.
                          <span className="text-muted">不变</span>
                        ) : (
                          <>
                            <span className="text-muted line-through">
                              {changed.old ?? "—"}
                            </span>
                            <span className="px-1 text-muted">→</span>
                            <span className="font-medium text-foreground">
                              {changed.new ?? "—"}
                            </span>
                          </>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        ) : null}

        {diff.errors.length > 0 ? (
          <>
            <div className="mb-1 mt-3 text-[11px] font-medium text-muted">
              被拒绝（{diff.errors.length} 行）
            </div>
            {diff.errors.map((error, index) => (
              <div
                key={index}
                className="flex items-baseline gap-2 border-b border-[#eae7e0] py-1.5 text-[12px]"
              >
                <div className="w-[132px] flex-none text-danger">
                  第 {error.line_number} 行
                </div>
                <div className="flex-1 leading-relaxed text-foreground">
                  {error.message}
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div className="flex flex-none items-center gap-2.5 border-t border-border bg-surface-muted px-3.5 py-2.5">
        <button
          type="button"
          disabled={!diff.applicable || pending}
          onClick={onApply}
          className="rounded-token bg-primary px-3 py-1.5 text-[12.5px] text-primary-foreground disabled:bg-surface disabled:text-muted"
        >
          确认写入 {diff.changes.length} 人
        </button>
        {diff.applicable ? null : (
          <span className="text-[11.5px] text-muted">
            先解决 {diff.errors.length} 条拒绝
          </span>
        )}
        <button
          type="button"
          onClick={onBack}
          className="ml-auto rounded-token border border-border bg-surface px-3 py-1.5 text-[12.5px] text-foreground"
        >
          返回改表
        </button>
      </div>
    </div>
  );
}
