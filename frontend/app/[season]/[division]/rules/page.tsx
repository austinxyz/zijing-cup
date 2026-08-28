import { notFound } from "next/navigation";

import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { getDivisionRules, type DivisionRules, type RuleLine } from "@/lib/api";

const KIND_LABELS: Record<string, string> = {
  mens_doubles: "男双",
  womens_doubles: "女双",
  mixed_doubles: "混双",
};

const LINE_LABELS: Record<string, string> = {
  D1: "第一男双",
  D2: "第二男双",
  D3: "第三男双",
  MD: "混双",
  WD: "女双",
};

function capOf(rules: DivisionRules | null, code: string): string | null {
  return rules?.lines.find((line) => line.code === code)?.cap ?? null;
}

/**
 * What changed for this line since last season.
 *
 * Returns null when there is nothing to say — either no previous season is on
 * record, or the value is the same. The captain's real question is "does last
 * year's lineup still fit", so an unchanged cap is worth stating too.
 */
function capChange(
  line: RuleLine,
  previous: DivisionRules | null,
): { kind: "same" } | { kind: "changed"; from: string; to: string } | null {
  if (!previous) return null;
  const before = capOf(previous, line.code);
  const after = line.cap;
  if (before === after) return { kind: "same" };
  if (before === null || after === null) return null;
  return { kind: "changed", from: before, to: after };
}

function LineCap({ line }: { line: RuleLine }) {
  if (line.cap === null) {
    // Never a number, however large: an open line is a different kind of
    // line, and in gold it is also worth fewer points.
    return <span className="font-mono text-sm text-muted">开放线</span>;
  }
  return <span className="font-mono text-sm">{line.cap}</span>;
}

interface PageProps {
  params: Promise<{ season: string; division: string }>;
}

export default async function RulesPage({ params }: PageProps) {
  const { season, division } = await params;

  const rules = await getDivisionRules(season, division);
  if (!rules) notFound();

  // The previous season is fetched separately rather than folded into the
  // endpoint: "what changed" is a presentation concern, and this keeps the
  // API's contract one season per response. A missing previous season is an
  // ordinary answer, not an error.
  const previousYear = rules.season.year - 1;
  const previous = await getDivisionRules(previousYear, division);

  const scoresPoints = rules.division.scoring_mode === "points";
  const bufferIsNew =
    previous !== null &&
    previous.division.buffer_total === "0.00" &&
    rules.division.buffer_total !== "0.00";

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-none flex-col gap-0.5 border-b border-border bg-surface px-[22px] py-[11px]">
        <h1 className="m-0 font-sans text-base font-semibold leading-snug">
          赛制规则
        </h1>
        <p className="m-0 font-sans text-[12.5px] text-muted">
          {rules.season.year} {rules.season.edition_name} ·{" "}
          {rules.division.display_name} · 五线双打，三场男双 + 一场女双 + 一场混双
        </p>
      </div>

      <div className="flex flex-col gap-4 p-[22px]">
        <Card className="p-0">
          <CardHeader className="mb-0 border-b border-border p-4">
            <CardTitle>各线 UTR Cap</CardTitle>
            <CardDescription>
              Cap 约束的是一条线上两名队员参赛 UTR 之和
              {scoresPoints ? " · 本组采用记分制，各线分值不同" : ""}
            </CardDescription>
          </CardHeader>

          <table
            aria-label="各线 UTR Cap"
            className="w-full border-collapse bg-surface"
          >
            <thead>
              <tr>
                {["线", "类型", "UTR Cap", scoresPoints ? "分值" : "", "较上一赛季"]
                  .filter(Boolean)
                  .map((heading) => (
                    <th
                      key={heading}
                      className="h-[34px] whitespace-nowrap border-b border-border bg-surface-muted px-3.5 text-left font-mono text-[11px] font-medium tracking-wide text-muted"
                    >
                      {heading}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rules.lines.map((line) => {
                const change = capChange(line, previous);
                return (
                  <tr key={line.code} className="h-10">
                    <td className="border-b border-border/70 px-3.5 align-middle">
                      <span className="font-mono text-[12.5px] font-medium tracking-wide text-primary">
                        {line.code}
                      </span>
                    </td>
                    <td className="border-b border-border/70 px-3.5 align-middle">
                      <span className="font-sans text-[13px]">
                        {LINE_LABELS[line.code] ?? KIND_LABELS[line.kind]}
                      </span>
                    </td>
                    <td className="border-b border-border/70 px-3.5 align-middle">
                      <LineCap line={line} />
                    </td>
                    {scoresPoints && (
                      <td className="border-b border-border/70 px-3.5 align-middle">
                        <span className="font-mono text-[12.5px]">
                          {`${line.points} 分`}
                        </span>
                      </td>
                    )}
                    <td className="border-b border-border/70 px-3.5 align-middle">
                      {change === null ? (
                        <span className="font-sans text-[12.5px] text-muted-foreground">
                          —
                        </span>
                      ) : change.kind === "same" ? (
                        <span className="font-sans text-[12.5px] text-muted-foreground">
                          未变
                        </span>
                      ) : (
                        <Badge variant="warning">
                          {change.from} → {change.to}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <Card className="flex flex-1 flex-col gap-3">
            <CardHeader className="mb-0 flex flex-row items-baseline justify-between gap-2">
              <CardTitle>UTR Buffer</CardTitle>
              {bufferIsNew && <Badge variant="warning">本届新增</Badge>}
            </CardHeader>

            <div className="flex items-baseline justify-between gap-3">
              <span className="font-sans text-[13px] text-muted">全队预算</span>
              <span className="font-mono text-xl font-medium">
                {rules.division.buffer_total}
              </span>
            </div>

            {/* The single most misreadable rule in the system: five lines each
                0.2 over is illegal even though no single line exceeds 0.5. */}
            <div className="flex flex-col gap-1.5 rounded-token border border-[#e8d9ae] bg-[#fbf6e8] p-3">
              <div className="font-sans text-[12.5px] font-medium">
                这是共享预算，不是每线容差
              </div>
              <p className="m-0 font-sans text-xs leading-relaxed text-muted">
                每线最多超 Cap {rules.division.buffer_per_line}，
                <strong className="font-medium text-foreground">
                  且五线超出量之和也不得超过 {rules.division.buffer_total}
                </strong>
                。逐线判定会放出五线各超 0.2、合计 1.0 的非法阵容。
              </p>
            </div>
          </Card>

          <Card className="flex flex-1 flex-col gap-3">
            <CardHeader className="mb-0">
              <CardTitle>上场资格与通用约束</CardTitle>
            </CardHeader>

            <dl className="m-0 flex flex-col gap-2.5">
              {rules.eligibility_limits.map((limit) => (
                <div
                  key={`${limit.gender}-${limit.utr_above}`}
                  className="flex flex-col gap-0.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="font-sans text-[13px] text-muted">
                      {`${limit.gender === "M" ? "男队员" : "女队员"} UTR > ${limit.utr_above}`}
                    </dt>
                    <dd className="m-0 font-mono text-[13px]">
                      {`≤ ${limit.max_players} 名`}
                    </dd>
                  </div>
                  {limit.restricted_to_lines && (
                    <div className="font-sans text-[11.5px] text-muted-foreground">
                      {`只能打 ${limit.restricted_to_lines.join("、")}`}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-sans text-[13px] text-muted">搭档 UTR 差距</dt>
                <dd className="m-0 font-mono text-[13px]">
                  {`≤ ${rules.division.partner_gap_max}`}
                </dd>
              </div>

              {rules.division.mens_doubles_must_be_ordered && (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="font-sans text-[13px] text-muted">三线男双</dt>
                    <dd className="m-0 font-mono text-[13px]">不得倒序</dd>
                  </div>
                  <div className="font-sans text-[11.5px] text-muted-foreground">
                    规则原文未给数值定义，判定方式待组委会确认
                  </div>
                </div>
              )}

              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-sans text-[13px] text-muted">胜负判定</dt>
                <dd className="m-0 font-mono text-[13px]">
                  {scoresPoints ? "记分制" : "按场次"}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </main>
  );
}
