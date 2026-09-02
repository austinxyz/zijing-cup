import type { LineupFilterPreset, LineupPlayer } from "@/lib/api";

/** A locked player a preset names who is no longer on the roster. */
export interface StaleLockRef {
  line: string;
  key: string;
}

/** Counts shown on a preset row: how many lines it locks, how many it excludes. */
export function presetSize(preset: LineupFilterPreset): {
  locks: number;
  excluded: number;
} {
  return {
    locks: Object.keys(preset.constraints.locks ?? {}).length,
    excluded: (preset.constraints.excluded ?? []).length,
  };
}

/**
 * The locked references a preset can no longer honour: a seat whose player is
 * not in the current roster. Only locks count — a departed *excluded* player
 * is a moot exclusion (they cannot be picked anyway), not a reason to refuse.
 */
export function staleLockRefs(
  preset: LineupFilterPreset,
  roster: LineupPlayer[],
): StaleLockRef[] {
  const present = new Set(roster.map((p) => p.key));
  const refs: StaleLockRef[] = [];
  for (const [line, pair] of Object.entries(preset.constraints.locks ?? {})) {
    for (const key of pair) {
      if (!present.has(key)) refs.push({ line, key });
    }
  }
  return refs;
}

/**
 * The URL a valid preset loads to: the same query params the controls write,
 * so the page re-renders from the URL exactly as if they were filled by hand.
 * Excluded keys no longer on the roster are dropped — excluding a departed
 * player is a no-op, and carrying the key would only invite a stale-key error.
 * Callers must have checked staleLockRefs first; locks are written verbatim.
 */
export function buildLoadHref(
  basePath: string,
  preset: LineupFilterPreset,
  roster: LineupPlayer[],
): string {
  const present = new Set(roster.map((p) => p.key));
  const params = new URLSearchParams();
  for (const [line, pair] of Object.entries(preset.constraints.locks ?? {})) {
    params.set(`${line}a`, pair[0]);
    params.set(`${line}b`, pair[1]);
  }
  for (const key of preset.constraints.excluded ?? []) {
    if (present.has(key)) params.append("ex", key);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
