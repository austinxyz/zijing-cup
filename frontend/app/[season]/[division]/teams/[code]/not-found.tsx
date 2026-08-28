/**
 * A team code that names nothing.
 *
 * Scoped to this route so the shell and the team list stay: picking another
 * team from the list is exactly how you recover from a wrong code, and Next's
 * default not-found page replaces the whole window, taking that away.
 */
export default function TeamNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-[340px] flex-col items-center gap-2.5 text-center">
        <div className="text-sm font-medium text-foreground">没有这支球队</div>
        {/* Not "this team has no players" — the team itself is not on record
            for this season and division. */}
        <div className="text-[12.5px] leading-relaxed text-muted">
          这个赛季组别下没有该代号的球队。从左侧选一支球队，或换个赛季组别。
        </div>
      </div>
    </div>
  );
}
