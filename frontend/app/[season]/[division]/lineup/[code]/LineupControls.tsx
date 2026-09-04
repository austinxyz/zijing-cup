import type { LineupFilterPreset, LineupPlayer, RuleLine } from "@/lib/api";
import { playerName } from "@/lib/name";
import { Presets } from "./Presets";

/** Rank a gender for the select order: men, then women, then unmarked. */
function genderRank(gender: string | null): number {
  if (gender === "M") return 0;
  if (gender === "F") return 1;
  return 2;
}

/**
 * The order the player dropdowns list people in: by gender first (men, then
 * women, then unmarked), then by participation UTR high-to-low within a
 * gender. The mixed and women's lines pick from a different pool than the
 * men's, so clustering by gender puts the relevant people together, and
 * strongest-first is how a captain fills a line.
 *
 * UTR compares as a number — "10.00" is above "9.00", which a string sort
 * would get backwards. Returns a new array; the caller's roster is left as the
 * backend gave it (that order is what the search itself depends on).
 */
export function orderForSelect(roster: LineupPlayer[]): LineupPlayer[] {
  return [...roster].sort((a, b) => {
    const g = genderRank(a.gender) - genderRank(b.gender);
    if (g !== 0) return g;
    return Number(b.match_utr) - Number(a.match_utr);
  });
}

interface LineupControlsProps {
  lines: RuleLine[];
  roster: LineupPlayer[];
  /** Read from the query string, never held as state: the address bar is the
   *  only record of what was locked, so a link reproduces the same search. */
  locks: Record<string, [string, string]>;
  /** Line code to one pinned player key: one seat chosen, engine fills the
   *  partner. Read from the query string like locks. */
  pins?: Record<string, string>;
  excluded: string[];
  /** "sidebar" is the desktop left column; "drawer" is the same form inside
   *  the mobile bottom sheet — full width, no fixed width or right border, and
   *  the sheet owns the scroll. Same fields either way; only the frame differs. */
  variant?: "sidebar" | "drawer";
  /** Saved presets for this team, rendered above the lock/exclude controls.
   *  Omitted (undefined) means the block is not shown. */
  presets?: LineupFilterPreset[];
  canEdit?: boolean;
  basePath?: string;
  saveAction?: (
    constraints: LineupFilterPreset["constraints"],
    name: string,
  ) => Promise<void>;
  deleteAction?: (id: number) => Promise<void>;
}

function PlayerSelect({
  name,
  label,
  roster,
  value,
  tall = false,
}: {
  name: string;
  label: string;
  roster: LineupPlayer[];
  value: string;
  /** 44px in the mobile sheet (touch target); the desktop column stays 34px.
   *  min-w-0 lets a flex select shrink past a long option name instead of
   *  forcing the row wider than the viewport. */
  tall?: boolean;
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      className={`min-w-0 flex-1 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground ${
        tall ? "h-11" : "h-[34px]"
      }`}
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
  pins,
  excluded,
  variant = "sidebar",
  presets,
  canEdit = false,
  basePath,
  saveAction,
  deleteAction,
}: LineupControlsProps) {
  const excludedSet = new Set(excluded);
  const hasConstraints =
    Object.keys(locks).length > 0 ||
    Object.keys(pins ?? {}).length > 0 ||
    excluded.length > 0;
  // The dropdowns list people by gender then UTR; the exclusion checkboxes
  // below keep the backend order.
  const sortedRoster = orderForSelect(roster);

  const frame =
    variant === "sidebar"
      ? // Desktop left column, hidden on mobile (the drawer copy takes over there).
        "hidden w-[520px] flex-none border-r border-border overflow-y-auto md:flex"
      : // Inside the mobile sheet: full width, no border; the sheet scrolls.
        "flex w-full";

  return (
    <form
      method="get"
      role="search"
      aria-label="锁定与排除"
      className={`flex-col gap-3.5 bg-surface px-[18px] py-4 ${frame}`}
    >
      {/* Submitting the controls IS the search: the page only computes
          candidates when `go` is present, so the button carries it. Loading a
          preset writes the lock/exclude params WITHOUT go (a draft), so this is
          the one place that turns a draft into an actual search. */}
      <input type="hidden" name="go" value="1" />
      {presets !== undefined && basePath ? (
        <Presets
          presets={presets}
          roster={roster}
          lines={lines}
          canEdit={canEdit}
          hasConstraints={hasConstraints}
          basePath={basePath}
          saveAction={saveAction}
          deleteAction={deleteAction}
        />
      ) : null}

      <div className="flex flex-col gap-[3px]">
        <span className="text-[13px] font-semibold text-foreground">锁定搭档</span>
        <span className="text-[11.5px] leading-relaxed text-muted">
          留空的线交给引擎。锁定与排除都写在地址里，链接可以直接发给队友。
        </span>
      </div>

      <div className="flex flex-col gap-[7px]">
        {lines.map((line) => {
          const locked = locks[line.code];
          const pinned = pins?.[line.code];
          // Seat values: a lock fills both, a pin fills the first, otherwise
          // both are open. The engine treats either seat as the pin, so writing
          // it to the first is a display choice only.
          const pair: [string, string] = locked
            ? locked
            : [pinned ?? "", ""];
          return (
            <div key={line.code} className="flex flex-col gap-px">
              <div className="flex items-center gap-2.5">
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
                  roster={sortedRoster}
                  value={pair[0]}
                  tall={variant === "drawer"}
                />
                <PlayerSelect
                  name={`${line.code}b`}
                  label={`${line.code} 第二位`}
                  roster={sortedRoster}
                  value={pair[1]}
                  tall={variant === "drawer"}
                />
                {locked ? (
                  <span className="flex-none rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-primary">
                    锁整对
                  </span>
                ) : pinned ? (
                  <span className="flex-none rounded border border-warning-border bg-warning-surface px-1.5 py-0.5 font-mono text-[10px] text-warning">
                    已钉
                  </span>
                ) : null}
              </div>
              {pinned && !locked ? (
                <span className="ml-[72px] text-[10.5px] leading-snug text-muted">
                  已钉一人 · 搭档交给引擎（在满足所有规则下选最优）
                </span>
              ) : null}
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
              className={`flex items-center gap-1.5 rounded-token border border-border px-2 text-[12.5px] text-foreground ${
                // 44px tap target in the sheet; the desktop column stays compact.
                variant === "drawer" ? "min-h-11 py-2" : "py-1"
              }`}
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
        className={`flex flex-none items-center justify-center rounded-token bg-primary text-[13px] font-medium text-primary-foreground ${
          // 44px touch target inside the mobile sheet; the desktop column keeps
          // its tighter 36px.
          variant === "drawer" ? "h-11" : "h-9"
        }`}
      >
        搜索阵容
      </button>
    </form>
  );
}
