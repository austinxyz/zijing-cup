import { twMerge } from "tailwind-merge";

/**
 * Join class names, letting the last one that sets a given property win.
 *
 * This used to be a plain `join(" ")`, which is wrong in a way that never
 * announces itself: two classes setting the same property have equal CSS
 * specificity, so the winner is whichever rule happens to sit later in the
 * generated stylesheet. A caller passing `className="text-foreground"` to a
 * component whose variant already sets `text-muted` gets one of them, cannot
 * tell which, and did not choose. It has already cost us once — a Badge kept
 * rendering `text-muted` at 4.09:1 contrast while its caller asked for
 * `text-foreground`, and the fix at the time was to add a whole variant.
 *
 * Order is now meaningful: `cn(base, variant, className)` means the caller's
 * class wins, which is what every call site already assumed.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes);
}
