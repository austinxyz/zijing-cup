/**
 * Left-column search form. Plain GET form: the four conditions land in the URL
 * (shareable, survives refresh), and because there is NO hidden `sel` input a
 * new search drops the current selection. Explicit submit — not per-keystroke —
 * so it does not hammer the backend.
 */
export function PlayerSearch({
  q,
  gender,
  team,
  year,
  years,
}: {
  q: string;
  gender: string;
  team: string;
  year: string;
  years: number[];
}) {
  const field =
    "h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground";
  return (
    <form method="get" className="flex flex-none flex-col gap-2.5 p-3">
      <label className="flex flex-col gap-1 text-[11.5px] text-muted">
        姓名
        <input
          type="search"
          name="q"
          aria-label="姓名"
          placeholder="姓或名…"
          defaultValue={q}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] text-muted">
        性别
        <select name="gender" aria-label="性别" defaultValue={gender} className={field}>
          <option value="">全部</option>
          <option value="M">男</option>
          <option value="F">女</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] text-muted">
        所在队伍
        <input
          type="search"
          name="team"
          aria-label="所在队伍"
          placeholder="队名或代码，如 北大 / PKU"
          defaultValue={team}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-[11.5px] text-muted">
        参赛年份
        <select name="year" aria-label="参赛年份" defaultValue={year} className={field}>
          <option value="">全部</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="h-8 rounded-token bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground"
      >
        搜索
      </button>
    </form>
  );
}
