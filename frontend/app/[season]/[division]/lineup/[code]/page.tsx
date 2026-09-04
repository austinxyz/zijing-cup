import { notFound } from "next/navigation";

import {
  getDivisionRules,
  getSavedLineups,
  getTeamLineups,
  getTeamPresets,
  getTeamRoster,
  type LineupPlayer,
  type LineupSearch,
  type RuleLine,
} from "@/lib/api";
import { isSignedIn } from "@/lib/admin";
import {
  savePreset,
  deletePreset,
  saveLineup,
  deleteSavedLineup,
  saveBackLineup,
  validateAssignment,
} from "./actions";
import { CollapsibleSaved } from "./CollapsibleSaved";
import { EditModeToggle } from "./EditModeToggle";
import { LineupControls } from "./LineupControls";
import { LineupMobileControls } from "./LineupMobileControls";
import { LineupResults } from "./LineupResults";
import { SavedLineups } from "./SavedLineups";
import { StaleLink } from "./LineupStates";
import { rosterFromTeam } from "./roster";

/** A key from before the read-path switch: a bare `roster_entries` id. */
const OLD_KEY = /^\d+$/;

/**
 * Whether this request carries keys built before the keys changed shape.
 *
 * Checked here as well as on the server because the page must not fall back
 * to an unconstrained search: both id spaces are small integers, so a stale
 * key can name a real player who is simply not the one the link meant, and
 * the resulting lineup would look entirely healthy.
 */
export function hasStaleKeys(constraints: {
  locks: Record<string, [string, string]>;
  pins?: Record<string, string>;
  excluded: string[];
}): boolean {
  const keys = [
    ...Object.values(constraints.locks).flat(),
    ...Object.values(constraints.pins ?? {}),
    ...constraints.excluded,
  ];
  return keys.some((key) => OLD_KEY.test(key));
}

interface PageProps {
  params: Promise<{ season: string; division: string; code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function one(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function many(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/**
 * The locks and exclusions the query string names.
 *
 * A line counts as locked only when both of its seats are filled: a half
 * chosen pair is a partly filled form, not a constraint, and sending it as
 * one would answer a question nobody asked.
 */
export function constraintsFromQuery(
  lines: RuleLine[],
  query: Record<string, string | string[] | undefined>,
): {
  locks: Record<string, [string, string]>;
  pins: Record<string, string>;
  excluded: string[];
} {
  const locks: Record<string, [string, string]> = {};
  const pins: Record<string, string> = {};
  for (const line of lines) {
    const first = one(query[`${line.code}a`]);
    const second = one(query[`${line.code}b`]);
    if (first && second) {
      // Both seats: a hard lock — unless they name the same person, which is
      // neither a legal pair nor a pin, so it constrains nothing.
      if (first !== second) locks[line.code] = [first, second];
    } else if (first || second) {
      // Exactly one seat: a pin. Either seat counts; the pair is unordered.
      pins[line.code] = first || second;
    }
  }
  return { locks, pins, excluded: many(query.ex) };
}

export default async function LineupPage({ params, searchParams }: PageProps) {
  const { season, division, code } = await params;
  const query = await searchParams;

  const rules = await getDivisionRules(season, division);
  // No rules means no such season/division, and a lineup is meaningless
  // without the caps it is checked against: rendering the page with empty
  // lines would show a search that was never constrained by anything.
  if (rules === null) notFound();
  const lines = rules.lines;
  const constraints = constraintsFromQuery(lines, query);

  // The candidate search runs only when the request asks for it with `go`. A
  // full solve is the slowest thing this app does; the default view is meant to
  // show the saved lineups without paying for it. `go` is a switch, never a
  // constraint — it does not enter constraintsFromQuery. Checked on the server
  // so a directly-visited draft URL cannot slip a solve through the client.
  const go = one(query.go) === "1";
  const constrained =
    Object.keys(constraints.locks).length > 0 ||
    Object.keys(constraints.pins).length > 0 ||
    constraints.excluded.length > 0;
  const stale = hasStaleKeys(constraints);

  // Everything the page needs regardless of go: the saved lineups (re-judged
  // server-side), the presets, and whether the viewer is an admin.
  const [saved, presets, canEdit] = await Promise.all([
    getSavedLineups(season, division, code),
    getTeamPresets(season, division, code),
    isSignedIn(),
  ]);

  // The roster the controls and saved cards read. With `go` it comes free with
  // the search; without `go` it is fetched on its own — `getTeamRoster` carries
  // the derived participation UTR and runs no solve.
  let search: LineupSearch | null = null;
  let baseline: LineupSearch | null = null;
  let roster: LineupPlayer[];
  if (go) {
    // The second, unconstrained search says what the locks cost, and runs
    // alongside the real one (never in sequence — two full solves on a cold
    // free-tier instance risks a timeout). A stale link is answered without a
    // constrained search at all.
    [search, baseline] = stale
      ? [await getTeamLineups(season, division, code), null]
      : await Promise.all([
          getTeamLineups(season, division, code, constraints),
          constrained
            ? getTeamLineups(season, division, code)
            : Promise.resolve(null),
        ]);
    // Not an empty result: that would claim this team can field nothing, a
    // different and false statement about a team that does not exist.
    if (search === null) notFound();
    roster = search.roster;
  } else {
    const team = await getTeamRoster(season, division, code);
    if (team === null) notFound();
    roster = rosterFromTeam(team);
  }

  const basePath = `/${season}/${division}/lineup/${encodeURIComponent(code)}`;
  // Bound server actions: the client supplies only the name / id. The current
  // locks and exclusions travel with the save, captured here on the server.
  // Bound to (season,division,team) only — the constraints are read from the
  // LIVE controls at save time, not the URL, so edits made after loading a
  // preset (and before submitting a search) are captured. Binding the URL
  // constraints here would persist the state as it was loaded and drop the edits.
  const saveAction = savePreset.bind(null, season, division, code);
  const deleteAction = deletePreset.bind(null, season, division, code);
  // Saving a specific candidate: the client sends only the name + assignment;
  // (season,division,team) ride the binding, the UTR snapshot is built on the
  // server. The tables build the button from these props — a bound server
  // action crosses to a client component, a render function would not.
  const saveLineupAction = saveLineup.bind(null, season, division, code);
  const deleteSavedAction = deleteSavedLineup.bind(null, season, division, code);
  // Editing a saved lineup in place: validate a candidate assignment, then save
  // it back. Same bindings the standalone /saved page uses.
  const validateSavedAction = validateAssignment.bind(null, season, division, code);
  const saveBackSavedAction = saveBackLineup.bind(null, season, division, code);

  const men = roster.filter((p) => p.gender === "M").length;
  const women = roster.filter((p) => p.gender === "F").length;
  const capSummary = lines
    .map((line) => (line.cap === null ? "开放" : line.cap))
    .join(" / ");

  // The controls are uncontrolled (defaultValue / defaultChecked), so a soft
  // navigation — loading a preset or a saved lineup pushes a new URL without a
  // full reload — re-renders the tree but reuses the existing <select>/<input>
  // DOM nodes, and defaultValue only applies on mount. Keying the controls on
  // the constraints forces a remount when they change, so a loaded preset
  // actually fills the dropdowns instead of only changing the address bar.
  const controlsKey = JSON.stringify([
    constraints.locks,
    constraints.pins,
    constraints.excluded,
  ]);

  return (
    <div className="flex flex-1 min-h-0">
      <LineupControls
        key={controlsKey}
        lines={lines}
        roster={roster}
        locks={constraints.locks}
        pins={constraints.pins}
        excluded={constraints.excluded}
        presets={presets}
        canEdit={canEdit}
        basePath={basePath}
        saveAction={saveAction}
        deleteAction={deleteAction}
      />
      <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
        <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex items-baseline gap-2.5">
              <span className="text-base font-semibold text-foreground">{code}</span>
              <span className="text-[12.5px] text-muted-foreground">
                {roster.length} 人 · {men} 男 · {women} 女
              </span>
            </div>
            {/* The rule values in force, from the database. They differ by
                season and division, so a captain checking a lineup by eye
                needs the ones this search actually used. */}
            <span className="font-mono text-[11px] text-muted-foreground">
              五线 cap {capSummary} · 全队 buffer{" "}
              {rules.division.buffer_total} · 搭档差距 ≤
              {rules.division.partner_gap_max}
            </span>
          </div>
          <div className="flex flex-none items-center gap-3">
            {/* In-place admin unlock: type the password here instead of being
                sent to /login, then the edit controls appear on refresh. */}
            <EditModeToggle signedIn={canEdit} />
            {/* The number every lineup is checked against is the frozen one,
                not today's rating. */}
            <span className="font-mono text-[11.5px] text-muted-foreground">
              参赛 UTR · 赛前冻结
            </span>
          </div>
        </div>

        {/* Narrow viewport: results lead, controls fold into a sheet whose
            closed state names the constraints in force. The desktop keeps the
            controls as the left column (hidden md:flex on that form). */}
        <LineupMobileControls
          controls={
            <LineupControls
              key={controlsKey}
              lines={lines}
              roster={roster}
              locks={constraints.locks}
              pins={constraints.pins}
              excluded={constraints.excluded}
              variant="drawer"
              presets={presets}
              canEdit={canEdit}
              basePath={basePath}
              saveAction={saveAction}
              deleteAction={deleteAction}
            />
          }
          locks={constraints.locks}
          excluded={constraints.excluded}
          roster={roster}
        />

        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
          {/* Top: the team's saved lineups, re-judged server-side, collapsible.
              This is what the default (no-go) view leads with — the search is
              not run until the reader asks for it. */}
          <CollapsibleSaved count={saved.length}>
            <SavedLineups
              saved={saved}
              roster={roster}
              canEdit={canEdit}
              basePath={basePath}
              lineOrder={lines.map((line) => line.code)}
              deleteAction={canEdit ? deleteSavedAction : undefined}
              validateAction={canEdit ? validateSavedAction : undefined}
              saveBackAction={canEdit ? saveBackSavedAction : undefined}
            />
          </CollapsibleSaved>

          {/* Bottom: the candidate search — only when go asked for it. */}
          <div className="flex min-h-0 flex-col gap-3 px-5 py-4">
            {!go ? (
              <div className="rounded-token border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
                还没有搜索候选。左栏设好锁定/排除后点「搜索阵容」，结果显示在这里。
              </div>
            ) : stale ? (
              <StaleLink
                resetHref={`/${season}/${division}/lineup/${encodeURIComponent(code)}`}
              />
            ) : search ? (
              <LineupResults
                search={search}
                lines={lines}
                bufferTotal={rules.division.buffer_total}
                lineOrder={lines.map((line) => line.code)}
                unconstrainedCeiling={baseline?.ceiling ?? null}
                canEdit={canEdit}
                saveAction={saveLineupAction}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
