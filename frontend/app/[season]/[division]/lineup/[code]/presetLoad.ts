import type { LineupFilterPreset, LineupPlayer } from "@/lib/api";

/** A locked player a preset names who is no longer on the roster. */
export interface StaleLockRef {
  line: string;
  key: string;
}

/** Counts shown on a preset row: how many lines it constrains (locks + pins),
 *  how many it excludes. A pin constrains a line just as a lock does, so a
 *  pin-only preset must not read as "锁 0". */
export function presetSize(preset: LineupFilterPreset): {
  locks: number;
  excluded: number;
} {
  return {
    locks:
      Object.keys(preset.constraints.locks ?? {}).length +
      Object.keys(preset.constraints.pins ?? {}).length,
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
  // A pinned player who has left the roster is stale for the same reason a
  // locked one is: the preset names someone who can no longer play there.
  for (const [line, key] of Object.entries(preset.constraints.pins ?? {})) {
    if (!present.has(key)) refs.push({ line, key });
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
  // The name rides along (URL-encoded by URLSearchParams) so the page can
  // prefill it and offer "更新「X」" — load-then-edit-then-save-back to the same
  // preset. It is not a constraint: constraintsFromQuery ignores it.
  params.set("preset", preset.name);
  for (const [line, pair] of Object.entries(preset.constraints.locks ?? {})) {
    params.set(`${line}a`, pair[0]);
    params.set(`${line}b`, pair[1]);
  }
  // A pin loads as a SINGLE filled seat (`${line}a`), the partner seat left
  // empty for the engine — exactly the shape the controls write and the shape
  // constraintsFromQuery reads back as a pin. (A `pin=LINE:key` param would be
  // ignored by constraintsFromQuery and the pin silently dropped on load.)
  for (const [line, key] of Object.entries(preset.constraints.pins ?? {})) {
    if (present.has(key)) params.set(`${line}a`, key);
  }
  for (const key of preset.constraints.excluded ?? []) {
    if (present.has(key)) params.append("ex", key);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
