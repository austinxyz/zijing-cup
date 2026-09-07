import type { PlayerNoteCategory } from "@/lib/api";

/** key → Chinese label. A record keyed by the literal union so a new backend
 *  category is a tsc error (missing key) rather than a raw string on screen.
 *  Shared by the detail-page 评价 section and every surfacing surface so the
 *  labels/colours never drift apart. */
export const CATEGORY_LABEL: Record<PlayerNoteCategory, string> = {
  strength: "优点",
  weakness: "弱点",
  partner: "适合搭档",
  other: "其他",
};

export const CATEGORY_ORDER: PlayerNoteCategory[] = [
  "strength",
  "weakness",
  "partner",
  "other",
];

/** Pill classes per category. Weakness is the warning family (the signal a
 *  captain most wants at a glance); strength positive; partner blue; other
 *  neutral. Colours are contrast-checked ≥ 4.5:1 on a surface background. */
export const TAG_CLASS: Record<PlayerNoteCategory, string> = {
  strength:
    "inline-flex items-center rounded-full border border-[#cfe1d6] bg-[#eef4f0] px-2 py-px text-[11px] leading-relaxed text-[#3b6e4f]",
  weakness:
    "inline-flex items-center rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] leading-relaxed text-warning",
  partner:
    "inline-flex items-center rounded-full border border-[#c9d6ea] bg-[#eef2f8] px-2 py-px text-[11px] leading-relaxed text-[#3a5a86]",
  other:
    "inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] leading-relaxed text-muted",
};

/** ISO → "YYYY-MM-DD HH:mm" in the viewer's local time. The server stores one
 *  clock; the display just makes it readable. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
