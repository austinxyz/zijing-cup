import type { LineupPlayer, RuleLine } from "@/lib/api";
import { playerName } from "@/lib/name";

interface LineupControlsProps {
  lines: RuleLine[];
  roster: LineupPlayer[];
  /** Read from the query string, never held as state: the address bar is the
   *  only record of what was locked, so a link reproduces the same search. */
  locks: Record<string, [string, string]>;
  excluded: string[];
}

function PlayerSelect({
  name,
  label,
  roster,
  value,
}: {
  name: string;
  label: string;
  roster: LineupPlayer[];
  value: string;
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      className="h-[34px] flex-1 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
    >
      {/* The empty option is not "nobody": it is this line left to the
          engine, which is the normal case and has to read that way. */}
      <option value="">交给引擎</option>
      {roster.map((player) => (
        <option key={player.key} value={player.key}>
          {playerName(player)} · {player.match_utr}
        </option>
      ))}
    </select>
  );
}

/**
 * Locks and exclusions, as a plain GET form.
 *
 * Submitting writes them into the query string and the page re-renders from
 * it. Nothing is kept in client state: a second copy would disagree with the
 * address bar as soon as the link was shared or the page reloaded, and the
 * link is the point — a captain sends the search, not a screenshot.
 *
 * 520px wide, not the mock's 420. There is one exclusion chip per player, and
 * the largest roster on record (26) wrapped them to ten rows, which pushed
 * the panel past a 640px-tall window and left it scrolling on its own — the
 * scrollbar being the only sign the search button was still below the fold.
 *
 * The width is paid for out of the candidate cards, and the bill comes due
 * early: in gold, whose names are the longest, anything past ~460 makes a
 * card wrap to a third line (97px -> 110px), and no width between 460 and 520
 * avoids it. So 520 rather than 480 — the cost is the same and it leaves the
 * most headroom (593px of content against a 640px floor).
 *
 * The panel keeps its own scroller regardless: width buys headroom, it does
 * not bound the roster, and inside an h-screen overflow-hidden shell an
 * overflow with no scroller is cut off with nothing to say so.
 */
export function LineupControls({
  lines,
  roster,
  locks,
  excluded,
}: LineupControlsProps) {
  const excludedSet = new Set(excluded);

  return (
    <form
      method="get"
      role="search"
      aria-label="锁定与排除"
      className="flex w-[520px] flex-none flex-col gap-3.5 overflow-y-auto border-r border-border bg-surface px-[18px] py-4"
    >
      <div className="flex flex-col gap-[3px]">
        <span className="text-[13px] font-semibold text-foreground">锁定搭档</span>
        <span className="text-[11.5px] leading-relaxed text-muted">
          留空的线交给引擎。锁定与排除都写在地址里，链接可以直接发给队友。
        </span>
      </div>

      <div className="flex flex-col gap-[7px]">
        {lines.map((line) => {
          const pair = locks[line.code] ?? ["", ""];
          return (
            <div key={line.code} className="flex items-center gap-2.5">
              <span className="flex w-[62px] flex-none flex-col gap-px">
                <span className="text-[12.5px] font-medium text-foreground">
                  {line.code}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {/* An open line has no ceiling at all — saying "cap ∞" or a
                      large number would invite a comparison that has no
                      meaning. */}
                  {line.cap === null ? "无上限" : `cap ${line.cap}`}
                </span>
              </span>
              <PlayerSelect
                name={`${line.code}a`}
                label={`${line.code} 第一位`}
                roster={roster}
                value={pair[0]}
              />
              <PlayerSelect
                name={`${line.code}b`}
                label={`${line.code} 第二位`}
                roster={roster}
                value={pair[1]}
              />
            </div>
          );
        })}
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-[7px]">
        <span className="text-[13px] font-semibold text-foreground">本场不能上</span>
        <div className="flex flex-wrap gap-1.5">
          {roster.map((player) => (
            <label
              key={player.key}
              className="flex items-center gap-1.5 rounded-token border border-border px-2 py-1 text-[12.5px] text-foreground"
            >
              <input
                type="checkbox"
                name="ex"
                value={player.key}
                defaultChecked={excludedSet.has(player.key)}
              />
              <span>{playerName(player)}</span>
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        className="flex h-9 flex-none items-center justify-center rounded-token bg-primary text-[13px] font-medium text-primary-foreground"
      >
        搜索阵容
      </button>
    </form>
  );
}
