import { notFound } from "next/navigation";

import { getPlayer, type Player } from "@/lib/api";
import { playerName } from "@/lib/name";
import { mergePlayers } from "./actions";

interface PageProps {
  params: Promise<{ season: string; division: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DIVISION_LABEL: Record<string, string> = { gold: "金组", silver: "银组" };

interface Conflict {
  season_year: number;
  high: string;
  low: string;
}

/**
 * What the merge will produce, computed before it runs.
 *
 * A season the two records disagree about becomes contested rather than
 * blocking the merge — but nobody should find that out afterwards, so it is
 * spelled out here with both numbers and which one will be read.
 */
function conflictsBetween(keep: Player, merge: Player): Conflict[] {
  const byYear = new Map(keep.season_utrs.map((u) => [u.season_year, u]));
  const found: Conflict[] = [];

  for (const incoming of merge.season_utrs) {
    const existing = byYear.get(incoming.season_year);
    if (!existing || existing.value === incoming.value) continue;
    const [high, low] = [existing.value, incoming.value].sort(
      (a, b) => Number(b) - Number(a),
    );
    found.push({ season_year: incoming.season_year, high, low });
  }
  return found.sort((a, b) => b.season_year - a.season_year);
}

function Section({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-none flex-col rounded-token border border-border bg-surface"
    >
      <div className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-1.5 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

export default async function MergePage({ params, searchParams }: PageProps) {
  const { season, division, id } = await params;
  const query = await searchParams;

  const keep = await getPlayer(id);
  if (keep === null) notFound();

  const withId = Array.isArray(query.with) ? query.with[0] : query.with;
  const sameRecord = withId !== undefined && String(withId) === String(keep.id);
  const other =
    withId && !sameRecord ? await getPlayer(withId) : null;

  const conflicts = other ? conflictsBetween(keep, other) : [];

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-5 py-[11px]">
        <h1 className="text-base font-semibold text-foreground">
          合并 · {playerName(keep)}
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground">
          player #{keep.id} · 另一条记录会被删除
        </span>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        <div
          role="alert"
          className="flex-none rounded-token border border-danger-border bg-danger-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-danger"
        >
          <strong>合并不可撤销。</strong>
          本次没有操作历史。被并入的那条记录会被删除，它的成员关系与赛季 UTR 全部挂到这
          一条名下。执行前请确认下面哪条留、哪条走。
        </div>

        <form method="get" className="flex flex-none items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11.5px] text-muted">要并入的队员</span>
            <input
              name="with"
              aria-label="要并入的队员"
              inputMode="numeric"
              defaultValue={withId ?? ""}
              placeholder="队员 id"
              className="h-8 w-[180px] rounded-token border border-border bg-surface px-2.5 font-mono text-[12.5px] text-foreground"
            />
          </label>
          <button
            type="submit"
            className="flex h-8 items-center rounded-token border border-border bg-surface px-3 text-[12.5px] text-foreground"
          >
            预览合并
          </button>
        </form>

        {sameRecord ? (
          <div className="flex-none rounded-token border border-border bg-surface px-3.5 py-3 text-[12.5px] text-muted">
            一条记录不能和自己合并。
          </div>
        ) : null}

        {withId && !sameRecord && other === null ? (
          <div className="flex-none rounded-token border border-border bg-surface px-3.5 py-3 text-[12.5px] text-muted">
            找不到 id 为 {withId} 的队员。
          </div>
        ) : null}

        {other ? (
          <>
            <Section title="合并结果" label="合并结果">
              <span className="text-foreground">
                保留 <strong>{playerName(keep)} · #{keep.id}</strong>；
                <strong>
                  {playerName(other)} · #{other.id}
                </strong>{" "}
                会被<strong>删除</strong>。
              </span>
              <span>
                合并后这条记录会有 {keep.memberships.length + other.memberships.length}{" "}
                条成员关系：
                {[...keep.memberships, ...other.memberships]
                  .map(
                    (m) =>
                      `${m.season_year} ${DIVISION_LABEL[m.division_code] ?? m.division_code} ${m.team_code}`,
                  )
                  .join("、")}
              </span>
            </Section>

            <Section title="将产生的冲突" label="将产生的冲突">
              {conflicts.length === 0 ? (
                <span>
                  两边在同一赛季上的参赛 UTR 没有分歧，这次合并
                  <strong>不会产生冲突</strong>。
                </span>
              ) : (
                conflicts.map((conflict) => (
                  <span key={conflict.season_year}>
                    <strong>{conflict.season_year}</strong>：两边分别是 {conflict.high} 与{" "}
                    {conflict.low}，合并后标记为未裁决，裁决之前按{" "}
                    <strong>{conflict.high}</strong>（较大值）参与计算。
                  </span>
                ))
              )}
            </Section>

            <form action={mergePlayers} className="flex flex-none justify-end gap-2">
              <input type="hidden" name="playerId" value={keep.id} />
              <input type="hidden" name="mergeId" value={other.id} />
              <input type="hidden" name="season" value={season} />
              <input type="hidden" name="division" value={division} />
              <button
                type="submit"
                className="flex h-8 items-center rounded-token bg-primary px-3 text-[12.5px] font-medium text-primary-foreground"
              >
                合并并删除 #{other.id}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
