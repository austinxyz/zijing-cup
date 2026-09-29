import type { PreviewLine } from "./sidePreview";

/** ♂ / ♀ / neutral, coloured by the shared gender tokens (as the lineup views). */
function GenderMark({ gender }: { gender: string | null }) {
  if (gender === "M") return <span className="text-male" aria-label="男">♂</span>;
  if (gender === "F") return <span className="text-female" aria-label="女">♀</span>;
  return <span className="text-muted-foreground" aria-hidden="true">·</span>;
}

/**
 * A selected side's on-court list: the 5 lines of a saved lineup, each with its
 * two players (name + gender + participation UTR) and the line sum. Read straight
 * from the resolved preview (see sidePreview.ts); no fetching here.
 *
 * Explicit `bg-surface` — inheriting the page background would put the muted text
 * on the wrong contrast base.
 */
export function SideLineupPreview({ lines }: { lines: PreviewLine[] }) {
  return (
    <div className="mt-1 rounded-token border border-border bg-surface p-2">
      <div className="mb-1.5 font-mono text-[10.5px] text-muted-foreground">
        上场 {lines.reduce((n, l) => n + l.players.length, 0)} 人 · {lines.length} 线
      </div>
      <div role="table" className="flex flex-col">
        {lines.map((l) => (
          <div
            key={l.line}
            role="row"
            aria-label={l.line}
            className="flex items-center gap-2 border-t border-border py-[3px] first:border-t-0"
          >
            <span className="w-[34px] flex-none font-mono text-[11px] font-semibold text-muted-foreground">
              {l.line}
            </span>
            <span className="flex flex-1 flex-wrap gap-x-2.5 gap-y-0.5 text-[12px]">
              {l.players.map((p) => (
                <span key={p.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                  <span>{p.name}</span>
                  <GenderMark gender={p.gender} />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {p.utr ?? "—"}
                  </span>
                </span>
              ))}
            </span>
            <span className="w-[52px] flex-none text-right font-mono text-[11px] text-muted-foreground">
              {l.sum ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
