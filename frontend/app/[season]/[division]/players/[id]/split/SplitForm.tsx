import type { Player } from "@/lib/api";
import { playerName } from "@/lib/name";
import { splitPlayer } from "./actions";

interface SplitFormProps {
  player: Player;
  /** Which rows go to the new person. Read from the URL, not held in state:
   *  a half-made split someone shares or reloads has to come back the same. */
  selectedMemberships: number[];
  selectedSeasons: number[];
  season: string;
  division: string;
}

const DIVISION_LABEL: Record<string, string> = { gold: "金组", silver: "银组" };

function Side({
  title,
  label,
  memberships,
  seasons,
  empty,
  children,
}: {
  title: string;
  label: string;
  memberships: Player["memberships"];
  seasons: Player["season_utrs"];
  empty: string;
  children?: React.ReactNode;
}) {
  const nothing = memberships.length === 0 && seasons.length === 0;

  return (
    <section
      aria-label={label}
      className="flex flex-1 flex-col rounded-token border border-border bg-surface"
    >
      <div className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3 text-[12.5px] text-muted">
        {children}
        {nothing ? (
          <span>{empty}</span>
        ) : (
          <>
            {memberships.map((m) => (
              <span key={m.id}>
                {m.season_year} {DIVISION_LABEL[m.division_code] ?? m.division_code} ·{" "}
                {m.team_code}
                {m.representing_school ? ` · 代表 ${m.representing_school}` : ""}
              </span>
            ))}
            {seasons.map((utr) => (
              <span key={utr.season_year} className="font-mono">
                {utr.season_year} 赛季 UTR {utr.value}
              </span>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Choose which records leave, and see both sides of the result first.
 *
 * The selection lives in the query string and the page recomputes both columns
 * from it. A split's mistake is always "that row went the wrong way", and it is
 * only catchable if each side states what it ends up with before the button is
 * pressed — this operation has no undo.
 */
export function SplitForm({
  player,
  selectedMemberships,
  selectedSeasons,
  season,
  division,
}: SplitFormProps) {
  const movingMemberships = player.memberships.filter((m) =>
    selectedMemberships.includes(m.id),
  );
  const stayingMemberships = player.memberships.filter(
    (m) => !selectedMemberships.includes(m.id),
  );
  const movingSeasons = player.season_utrs.filter((u) =>
    selectedSeasons.includes(u.season_year),
  );
  const stayingSeasons = player.season_utrs.filter(
    (u) => !selectedSeasons.includes(u.season_year),
  );

  return (
    <div className="flex flex-col gap-3">
      <form method="get" className="contents">
        <section
          aria-label="把哪些记录分出去"
          className="flex flex-col rounded-token border border-border bg-surface"
        >
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
            <span className="text-[12.5px] font-semibold text-foreground">
              把哪些记录分出去
            </span>
            <span className="text-[12px] text-muted">
              未勾选的留在 #{player.id}
            </span>
          </div>

          <div className="flex flex-col">
            {player.memberships.map((m) => (
              <label
                key={`m-${m.id}`}
                className="flex items-center gap-2.5 border-b border-border px-3.5 py-2 text-[12.5px] text-foreground"
              >
                <input
                  type="checkbox"
                  name="m"
                  value={m.id}
                  defaultChecked={selectedMemberships.includes(m.id)}
                  aria-label={`成员关系 ${m.season_year} ${m.team_code}`}
                />
                <span className="w-[92px] flex-none text-muted">成员关系</span>
                <span className="font-mono text-muted-foreground">{m.season_year}</span>
                <span className="flex-1">
                  {DIVISION_LABEL[m.division_code] ?? m.division_code} · {m.team_code}
                  {m.representing_school ? ` · 代表 ${m.representing_school}` : ""}
                </span>
                {/* Evidence, not decoration: the profile link is the only thing
                    that can settle whether two records are one human. */}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {player.utr_profile_id
                    ? `UTR 链接 …/${player.utr_profile_id}`
                    : "UTR 链接未填"}
                </span>
              </label>
            ))}

            {player.season_utrs.map((utr) => (
              <label
                key={`s-${utr.season_year}`}
                className="flex items-center gap-2.5 border-b border-border px-3.5 py-2 text-[12.5px] text-foreground"
              >
                <input
                  type="checkbox"
                  name="s"
                  value={utr.season_year}
                  defaultChecked={selectedSeasons.includes(utr.season_year)}
                  aria-label={`赛季 UTR ${utr.season_year}`}
                />
                <span className="w-[92px] flex-none text-muted">赛季 UTR</span>
                <span className="font-mono text-muted-foreground">
                  {utr.season_year}
                </span>
                <span className="flex-1 font-mono">
                  {utr.value}
                  {utr.alt_value ? ` / ${utr.alt_value}` : ""}
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end px-3.5 py-2.5">
            <button
              type="submit"
              className="flex h-8 items-center rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground"
            >
              更新预览
            </button>
          </div>
        </section>
      </form>

      <div className="flex gap-3">
        <Side
          title="留在原记录"
          label="留在原记录"
          memberships={stayingMemberships}
          seasons={stayingSeasons}
          empty="这条记录会变成空的——没有任何成员关系或赛季 UTR。"
        >
          <span className="text-foreground">
            {playerName(player)} · #{player.id}
          </span>
        </Side>

        <Side
          title="分出为新队员"
          label="分出为新队员"
          memberships={movingMemberships}
          seasons={movingSeasons}
          empty="没有选中任何记录，新队员会是一条空记录。"
        />
      </div>

      <form action={splitPlayer} className="flex flex-col gap-3">
        <input type="hidden" name="playerId" value={player.id} />
        <input type="hidden" name="season" value={season} />
        <input type="hidden" name="division" value={division} />
        {selectedMemberships.map((id) => (
          <input key={id} type="hidden" name="m" value={id} />
        ))}
        {selectedSeasons.map((year) => (
          <input key={year} type="hidden" name="s" value={year} />
        ))}

        <section className="flex gap-3 rounded-token border border-border bg-surface px-3.5 py-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11.5px] text-muted">姓（可改）</span>
            <input
              name="lastName"
              aria-label="新队员的姓"
              defaultValue={player.last_name}
              className="h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11.5px] text-muted">名（可改）</span>
            <input
              name="firstName"
              aria-label="新队员的名"
              defaultValue={player.first_name}
              className="h-8 rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11.5px] text-muted">UTR 链接</span>
            <input
              name="utrProfileId"
              aria-label="新队员的 UTR 链接"
              placeholder="填上才能验证这是两个人"
              className="h-8 rounded-token border border-border bg-surface px-2.5 font-mono text-[12px] text-foreground"
            />
          </label>
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            className="flex h-8 items-center rounded-token bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
          >
            拆分为两名队员
          </button>
        </div>
      </form>
    </div>
  );
}
