import { notFound } from "next/navigation";

import {
  getDivisionRules,
  getTeamLineups,
  getTeamPresets,
  type RuleLine,
} from "@/lib/api";
import { isSignedIn } from "@/lib/admin";
import { savePreset, deletePreset, saveLineup } from "./actions";
import { LineupControls } from "./LineupControls";
import { LineupMobileControls } from "./LineupMobileControls";
import { LineupResults } from "./LineupResults";
import { StaleLink } from "./LineupStates";

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

  // The second, unconstrained search exists so the page can say what the
  // locks cost; without it the ceiling reads as this team's ceiling rather
  // than the ceiling of the question that was asked. It runs only when
  // something is actually constrained — with nothing locked it is the same
  // search twice — and it runs *alongside* the real one rather than after it:
  // neither depends on the other, and a full solve on a cold free-tier
  // instance is slow enough that doing them in sequence risks the request
  // timing out before either answer arrives.
  const constrained =
    Object.keys(constraints.locks).length > 0 ||
    Object.keys(constraints.pins).length > 0 ||
    constraints.excluded.length > 0;
  const stale = hasStaleKeys(constraints);
  // A stale link is answered without asking for a search at all: running one
  // and dropping the locks would produce a full, healthy-looking candidate
  // list for a question nobody asked.
  const [search, baseline] = stale
    ? [await getTeamLineups(season, division, code), null]
    : await Promise.all([
        getTeamLineups(season, division, code, constraints),
        constrained
          ? getTeamLineups(season, division, code)
          : Promise.resolve(null),
      ]);

  // Not an empty result: that would claim this team can field nothing, which
  // is a different and false statement about a team that does not exist.
  if (search === null) notFound();

  // Presets and admin state for the saved-filter block. Read in parallel with
  // nothing that depends on them; the block is read-only for a visitor.
  const [presets, canEdit] = await Promise.all([
    getTeamPresets(season, division, code),
    isSignedIn(),
  ]);
  const basePath = `/${season}/${division}/lineup/${encodeURIComponent(code)}`;
  // Bound server actions: the client supplies only the name / id. The current
  // locks and exclusions travel with the save, captured here on the server.
  const saveAction = savePreset.bind(null, season, division, code, {
    locks: constraints.locks,
    excluded: constraints.excluded,
  });
  const deleteAction = deletePreset.bind(null, season, division, code);
  // Saving a specific candidate: the client sends only the name + assignment;
  // (season,division,team) ride the binding, the UTR snapshot is built on the
  // server. The tables build the button from these props — a bound server
  // action crosses to a client component, a render function would not.
  const saveLineupAction = saveLineup.bind(null, season, division, code);

  const men = search.roster.filter((p) => p.gender === "M").length;
  const women = search.roster.filter((p) => p.gender === "F").length;
  const capSummary = lines
    .map((line) => (line.cap === null ? "开放" : line.cap))
    .join(" / ");

  return (
    <div className="flex flex-1 min-h-0">
      <LineupControls
        lines={lines}
        roster={search.roster}
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
                {search.roster.length} 人 · {men} 男 · {women} 女
              </span>
              <a
                href={`${basePath}/saved`}
                className="text-[12px] text-primary underline-offset-2 hover:underline"
              >
                已存阵容 →
              </a>
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
          {/* The number every lineup is checked against is the frozen one,
              not today's rating. */}
          <span className="flex-none font-mono text-[11.5px] text-muted-foreground">
            参赛 UTR · 赛前冻结
          </span>
        </div>

        {/* Narrow viewport: results lead, controls fold into a sheet whose
            closed state names the constraints in force. The desktop keeps the
            controls as the left column (hidden md:flex on that form). */}
        <LineupMobileControls
          controls={
            <LineupControls
              lines={lines}
              roster={search.roster}
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
          roster={search.roster}
        />

        {stale ? (
          <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
            <StaleLink
              resetHref={`/${season}/${division}/lineup/${encodeURIComponent(code)}`}
            />
          </div>
        ) : (
        <LineupResults
          search={search}
          lines={lines}
          bufferTotal={rules.division.buffer_total}
          lineOrder={lines.map((line) => line.code)}
          unconstrainedCeiling={baseline?.ceiling ?? null}
          canEdit={canEdit}
          saveAction={saveLineupAction}
        />
        )}
      </main>
    </div>
  );
}
