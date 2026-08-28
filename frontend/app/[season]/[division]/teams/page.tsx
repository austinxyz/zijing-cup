/**
 * No team chosen yet.
 *
 * Deliberately not a redirect to the first team: that would rewrite the
 * address bar on its own, and "first" is arbitrary — alphabetically it is
 * whichever code sorts first — so it would read as the app having picked a
 * team on the reader's behalf.
 *
 * Deliberately not an empty roster table either. An empty table says "this
 * team has no players", which is a different and false claim when no team has
 * been named.
 */
export default async function TeamsIndexPage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-[340px] flex-col items-center gap-2.5 text-center">
        <svg
          viewBox="0 0 48 48"
          width="40"
          height="40"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-border"
          aria-hidden="true"
        >
          <rect x="7" y="9" width="14" height="12" rx="2" />
          <rect x="7" y="27" width="14" height="12" rx="2" />
          <path d="M28 13h13M28 19h9M28 31h13M28 37h9" />
        </svg>
        <div className="text-sm font-medium text-foreground">
          从左侧选一支球队
        </div>
        <div className="text-[12.5px] leading-relaxed text-muted">
          名单按参赛 UTR 从高到低排列。参赛 UTR
          是赛前冻结的取样结果，不随赛季中的比赛变化。
        </div>
      </div>
    </div>
  );
}
