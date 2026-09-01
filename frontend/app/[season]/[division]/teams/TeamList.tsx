import Link from "next/link";

import type { TeamSummary } from "@/lib/api";

interface TeamListProps {
  season: string;
  division: string;
  teams: TeamSummary[];
  /** The team code in the URL, if any. Not component state — the address bar
   *  is the only place the selection lives. */
  selected?: string;
}

/**
 * The always-present left column.
 *
 * It shows the gender split rather than an average UTR because that is the
 * constraint a captain is actually checking: a lineup needs one woman for
 * mixed doubles and two for women's, so at least three on court. The mean of
 * a 26-player roster says little about the eight who play.
 */
export function TeamList({
  season,
  division,
  teams,
  selected,
}: TeamListProps) {
  const players = teams.reduce((sum, team) => sum + team.player_count, 0);

  return (
    // The division shell is h-screen with overflow hidden, so something in
    // here has to scroll or the lower rows are simply cut off — 18 silver
    // teams at 46px already overflow a short window. The scroll goes on the
    // list, not this column: on the column it would carry the count header
    // away with it.
    <div className="flex w-full flex-none flex-col overflow-hidden border-border bg-surface md:w-[248px] md:border-r">
      <div className="flex flex-none items-baseline justify-between gap-2 border-b border-border px-3.5 py-[13px]">
        <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
          球队 · {teams.length}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {players} 人
        </span>
      </div>

      <ul className="flex flex-1 flex-col overflow-y-auto p-1.5">
        {teams.map((team) => (
          <TeamRow
            key={team.code}
            season={season}
            division={division}
            team={team}
            current={team.code === selected}
          />
        ))}
      </ul>
    </div>
  );
}

function TeamRow({
  season,
  division,
  team,
  current,
}: {
  season: string;
  division: string;
  team: TeamSummary;
  current: boolean;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-px">
        <span
          className={`truncate text-[13px] text-foreground ${
            current ? "font-medium" : ""
          }`}
        >
          {team.code}
        </span>
        {/* Only when a human has given one. Deriving a name from the code
            would put words on screen that nobody chose. */}
        {team.display_name ? (
          <span className="truncate text-[11px] leading-tight text-muted-foreground">
            {team.display_name}
          </span>
        ) : null}
      </span>
      <span className="flex flex-none flex-col items-end gap-px">
        <span className="font-mono text-[11px] text-muted">
          {team.player_count} 人
        </span>
        <span className="font-mono text-[10px] leading-tight text-muted-foreground">
          {team.men_count}男{" "}
          <span
            className={
              // Three women is the bare minimum to field mixed plus women's
              // doubles, so such a team cannot absorb one withdrawal. Legal,
              // not an error — hence weight rather than a status colour,
              // which is reserved for 「待定」 on the roster.
              team.women_count < 4
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            }
          >
            {team.women_count}女
          </span>
          {team.unknown_gender_count > 0 ? (
            <> {team.unknown_gender_count}性别未填</>
          ) : null}
        </span>
      </span>
    </>
  );

  const shared =
    "flex h-[46px] items-center justify-between gap-2 rounded-token";

  return (
    <li aria-label={team.code} aria-current={current ? "true" : undefined}>
      {current ? (
        // Present but not a link: a "go to" pointing at the page you are
        // already on is a dead click.
        <span
          className={`${shared} border-l-2 border-l-primary bg-[#faf5f3] pl-2 pr-2.5`}
        >
          {body}
        </span>
      ) : (
        <Link
          href={`/${season}/${division}/teams/${team.code}`}
          className={`${shared} px-2.5 no-underline hover:bg-surface-muted`}
        >
          {body}
        </Link>
      )}
    </li>
  );
}
