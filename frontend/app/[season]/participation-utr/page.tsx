import { getSeasonSampling, type SeasonSamplingRow } from "@/lib/api";
import { isSuper } from "@/lib/admin";

import { SamplingMonitor } from "./SamplingMonitor";
import { snapshotToday, setParticipationFromSampling } from "./actions";

interface PageProps {
  params: Promise<{ season: string }>;
}

/**
 * 参赛 UTR 采样监控（组委会）。参赛 UTR 取 9/21-9/25 五天双打 UTR 均值：每天
 * 「快照今天」把该赛季金+银所有队员的当前双打值存一笔，这页看每人 5 天走势 +
 * rated 均值，全 rated 才可一键「定为参赛 UTR」；projected/unrated 打「待核」旗，
 * 组委会人工核 match UTR。
 *
 * 跨金银、赛季级 → 组委会（super）工具：门用 isSuper（canEdit 是按组的，盖不住
 * 跨组）。非 super 只见提示、且不取数（采样是组委会内部）。
 */
export default async function ParticipationUtrPage({ params }: PageProps) {
  const { season } = await params;
  const superAdmin = await isSuper();

  if (!superAdmin) {
    return (
      <main className="flex flex-1 flex-col gap-2 bg-background px-6 py-6">
        <h1 className="text-base font-semibold text-foreground">参赛 UTR 采样监控</h1>
        <p className="text-[13px] text-muted-foreground">
          这是组委会工具（跨金银、赛季级），仅超级管理员可用。请用 super 密码在{" "}
          <a href="/login" className="text-primary underline">
            登录页
          </a>{" "}
          登录后再来。
        </p>
      </main>
    );
  }

  // Only fetched for the committee (super) — samples are internal.
  const rows: SeasonSamplingRow[] = await getSeasonSampling(season);
  // The day columns: the sorted union of every sampled date.
  const dates = Array.from(
    new Set(rows.flatMap((r) => r.samples.map((s) => s.sample_date))),
  ).sort();

  const snapshot = snapshotToday.bind(null, season);
  const setOne = setParticipationFromSampling.bind(null, season);

  return (
    <main className="flex flex-1 flex-col gap-3 bg-background px-6 py-6">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-base font-semibold text-foreground">{season} 参赛 UTR 采样</h1>
          <a
            href={`/${season}/gold/teams`}
            className="text-[12px] text-muted-foreground underline"
          >
            ← 回赛季
          </a>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          每天刷新当前双打 UTR 后点「快照今天」；5 天后按 rated 均值「定为参赛 UTR」。projected/unrated 待组委会核。
        </p>
      </div>
      <SamplingMonitor
        season={season}
        dates={dates}
        rows={rows}
        snapshotAction={snapshot}
        setAction={setOne}
      />
    </main>
  );
}
