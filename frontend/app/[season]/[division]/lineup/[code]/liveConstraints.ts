import type { RuleLine } from "@/lib/api";

export interface LiveConstraints {
  locks: Record<string, [string, string]>;
  pins: Record<string, string>;
  excluded: string[];
}

/**
 * The constraints as the controls currently stand, read straight off the live
 * form — NOT the URL. Saving a preset has to capture what is on screen: the
 * controls are a GET form whose edits do not reach the URL until the search is
 * submitted, so a URL-derived save would persist the state as it was loaded and
 * silently drop everything changed since.
 *
 * Per line: both seats filled with different players = a lock; exactly one seat
 * = a pin (partner left to the engine); zero, or the same player twice = no
 * constraint on that line. Excluded = the checked "本场不能上" boxes.
 */
export function constraintsFromForm(
  form: HTMLFormElement,
  lines: RuleLine[],
): LiveConstraints {
  const value = (name: string): string => {
    const el = form.elements.namedItem(name);
    // A lock/pin select has a unique name → a single element with `.value`.
    // (RadioNodeList also exposes `.value`, so this stays correct if it ever
    // matches one.)
    return el && "value" in el
      ? String((el as unknown as { value: unknown }).value ?? "")
      : "";
  };

  const locks: Record<string, [string, string]> = {};
  const pins: Record<string, string> = {};
  for (const line of lines) {
    const a = value(`${line.code}a`);
    const b = value(`${line.code}b`);
    if (a && b && a !== b) locks[line.code] = [a, b];
    else if (a && !b) pins[line.code] = a;
    else if (b && !a) pins[line.code] = b;
    // a === b (same person in both seats) or both empty → no constraint.
  }

  const excluded: string[] = [];
  const ex = form.elements.namedItem("ex");
  if (ex) {
    const boxes =
      ex instanceof RadioNodeList ? Array.from(ex) : [ex as Element];
    for (const box of boxes) {
      const input = box as HTMLInputElement;
      if (input.checked) excluded.push(input.value);
    }
  }

  return { locks, pins, excluded };
}

/** Whether the live form holds anything worth saving. */
export function hasLiveConstraints(c: LiveConstraints): boolean {
  return (
    Object.keys(c.locks).length > 0 ||
    Object.keys(c.pins).length > 0 ||
    c.excluded.length > 0
  );
}
