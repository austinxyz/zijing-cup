import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast, checked against the token file itself.
 *
 * Three separate contrast defects shipped on these tokens, and each was found
 * the same way: by measuring a rendered page, long after the code was written.
 * Reading the source never caught them, because whether a text token is
 * legible depends on the container behind it — a fact that is nowhere in the
 * declaration. This test does the arithmetic the eye cannot.
 */

const css = readFileSync(
  join(import.meta.dirname, "globals.css"),
  "utf8",
);

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`no --color-${name} in globals.css`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Every surface a given text token is actually rendered on. */
const PAIRS: Array<{ text: string; on: string[] }> = [
  // Content-area text sits on white cards, on the page ground, and on the
  // muted strip used for table headers — all three, so all three must pass.
  { text: "muted", on: ["surface", "bg", "surface-muted"] },
  { text: "muted-fg", on: ["surface", "bg", "surface-muted"] },
  { text: "fg", on: ["surface", "bg", "surface-muted"] },
  // Status badges are small text on a tinted strip, not fills — the same
  // measure-don't-eyeball rule applies, and a hard-coded pair would slip past
  // this test entirely. Each badge sits on its own surface; the success badge
  // also appears bare on a white card.
  { text: "danger", on: ["danger-surface"] },
  { text: "warning", on: ["warning-surface"] },
  { text: "success", on: ["success-surface", "surface"] },
  // Gender marks sit in a line block: on the white card body and on the muted
  // header strip. Small symbols, so both must clear 4.5:1.
  { text: "male", on: ["surface", "surface-muted"] },
  { text: "female", on: ["surface", "surface-muted"] },
  // The sidebar is its own page chrome with its own ground and its own
  // recessed well; content-area tokens are not valid here and vice versa.
  { text: "sidebar-fg", on: ["sidebar", "sidebar-well", "sidebar-active"] },
  // No sidebar-active for the dim tier: it marks a row as secondary or
  // unavailable, and the active row is neither. Every one of its six uses sits
  // on the panel ground or in the switcher's well; a dimmed label on the
  // current row would be a contradiction, so the pair is not listed rather
  // than being satisfied by darkening a token nothing renders that way.
  { text: "sidebar-fg-dim", on: ["sidebar", "sidebar-well"] },
  { text: "sidebar-fg-bright", on: ["sidebar", "sidebar-well", "sidebar-active"] },
];

describe("design token contrast", () => {
  for (const { text, on } of PAIRS) {
    for (const surface of on) {
      it(`--color-${text} is readable on --color-${surface}`, () => {
        expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(
          4.5,
        );
      });
    }
  }
});
