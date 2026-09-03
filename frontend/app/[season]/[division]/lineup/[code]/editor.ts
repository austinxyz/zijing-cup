/** One seat in a five-line assignment: a line code and which of its two seats
 *  (0 or 1). The unit an editor selects, swaps, or replaces. */
export interface Slot {
  line: string;
  index: 0 | 1;
}

type Assignment = Record<string, [string, string]>;

function clonePair(pair: [string, string]): [string, string] {
  return [pair[0], pair[1]];
}

/** A deep-enough copy: a new outer object and a new tuple per line, so an edit
 *  never mutates the caller's assignment (or React state). */
function copy(assignment: Assignment): Assignment {
  const out: Assignment = {};
  for (const [line, pair] of Object.entries(assignment)) {
    out[line] = clonePair(pair);
  }
  return out;
}

/** Exchange the players in two seats. Same-line or cross-line; the two seats
 *  may hold anyone. Returns a new assignment; the input is untouched. */
export function swapSlots(assignment: Assignment, a: Slot, b: Slot): Assignment {
  const out = copy(assignment);
  const av = out[a.line][a.index];
  const bv = out[b.line][b.index];
  out[a.line][a.index] = bv;
  out[b.line][b.index] = av;
  return out;
}

/** Set one seat to a chosen player key. Returns a new assignment; the input is
 *  untouched. Whether the key duplicates someone already placed is the
 *  backend's to report — this does not pre-block it. */
export function replaceSlot(
  assignment: Assignment,
  slot: Slot,
  key: string,
): Assignment {
  const out = copy(assignment);
  out[slot.line][slot.index] = key;
  return out;
}
