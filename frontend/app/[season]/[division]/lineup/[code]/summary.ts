import type { LineupPlayer } from "@/lib/api";
import { playerName } from "@/lib/name";

/**
 * A one-line, name-carrying summary of the constraints in force.
 *
 * The mobile lineup page shows results first and folds the controls into a
 * drawer; this is what the closed drawer reports. It names people, not counts:
 * a constrained result and the unconstrained best look identical on screen, and
 * "locked 2 pairs" still forces the drawer open to learn *who* — which is the
 * question. Empty means no constraint, said in words, because a blank line and
 * "constrained but silent" cannot be told apart.
 */
export function constraintSummary(
  locks: Record<string, [string, string]>,
  excluded: string[],
  roster: LineupPlayer[],
): string {
  const nameByKey = new Map(roster.map((p) => [p.key, playerName(p)]));
  const name = (key: string) => nameByKey.get(key) ?? key;

  const parts: string[] = [];

  const lockedPairs = Object.entries(locks);
  for (const [line, [a, b]] of lockedPairs) {
    parts.push(`${line} ${name(a)}·${name(b)}`);
  }

  if (excluded.length > 0) {
    parts.push(`排除 ${excluded.map(name).join("、")}`);
  }

  if (parts.length === 0) return "没有锁定或排除";

  const locked = lockedPairs.length > 0 ? `已锁 ${lockedPairs.length} 对` : "";
  return [locked, ...parts].filter(Boolean).join(" · ");
}
