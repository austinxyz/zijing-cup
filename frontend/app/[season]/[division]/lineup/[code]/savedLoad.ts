import type { LineupCandidate, LineupPlayer, SavedLineup } from "@/lib/api";

/** A saved seat whose player is no longer on the roster. */
export interface StaleSavedRef {
  line: string;
  key: string;
}

/** The line assignment of a search candidate: each line to its two player
 *  keys. This is exactly what gets saved and what the save endpoint stores. */
export function candidateAssignment(
  candidate: LineupCandidate,
): Record<string, [string, string]> {
  const assignment: Record<string, [string, string]> = {};
  for (const [line, pair] of Object.entries(candidate.lines)) {
    assignment[line] = [pair[0].key, pair[1].key];
  }
  return assignment;
}

/**
 * The seats a saved lineup can no longer honour: a named player who is not on
 * the current roster. Both keys of every line are checked. A lineup with any
 * stale ref cannot be loaded — the search URL would carry a key the backend
 * rejects as a stale link.
 */
export function savedStaleRefs(
  saved: SavedLineup,
  roster: LineupPlayer[],
): StaleSavedRef[] {
  const present = new Set(roster.map((p) => p.key));
  const refs: StaleSavedRef[] = [];
  for (const [line, pair] of Object.entries(saved.assignment)) {
    for (const key of pair) {
      if (!present.has(key)) refs.push({ line, key });
    }
  }
  return refs;
}

/**
 * The URL a valid saved lineup loads to: all five lines locked, written as the
 * same `<line>a`/`<line>b` params the controls fill by hand, so the page
 * re-renders from the URL as a fully-pinned search. Callers must have checked
 * savedStaleRefs first; keys are written verbatim.
 */
export function buildSavedLoadHref(
  basePath: string,
  saved: SavedLineup,
): string {
  const params = new URLSearchParams();
  for (const [line, pair] of Object.entries(saved.assignment)) {
    params.set(`${line}a`, pair[0]);
    params.set(`${line}b`, pair[1]);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
