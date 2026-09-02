import type {
  LineupInfeasibilityReason,
  LineupPlayer,
  LineupSearch,
  RuleLine,
} from "@/lib/api";
import { playerName } from "@/lib/name";

const LINE_LABEL: Record<string, string> = {
  mens_doubles: "男双",
  womens_doubles: "女双",
  mixed_doubles: "混双",
};

function lineName(lines: RuleLine[], code: string): string {
  const line = lines.find((item) => item.code === code);
  const kind = line ? LINE_LABEL[line.kind] : undefined;
  return kind ? `${kind}（${code}）` : code;
}

/** The order reasons are shown in, fixed so the panel does not reshuffle
 *  between renders: manpower first, then the two budget limits, then the rule
 *  restriction. Any kind the backend adds later sorts last. */
const REASON_ORDER = ["gender_shortage", "over_cap", "over_gap", "eligibility"];

function reasonRank(kind: string): number {
  const i = REASON_ORDER.indexOf(kind);
  return i === -1 ? REASON_ORDER.length : i;
}

/** Eligibility is a rule attribute, not something the captain did, so it reads
 *  on the neutral tier; the manpower and budget reasons are things to act on
 *  and take the warning tier. */
function isRuleReason(kind: string): boolean {
  return kind === "eligibility";
}

function whereLabel(where: string): string {
  return where === "excluded" ? "排除" : `已锁 ${where}`;
}

/**
 * One reason a line's candidate pool is empty.
 *
 * The tier follows the kind: a warning surface for what the captain can act on
 * (too few of a gender, everyone over cap or over the gap), a neutral surface
 * for the eligibility restriction, which is the rules' doing and not theirs.
 * Attribution chips only appear when the backend named players — which it does
 * only for a gender shortage — and never for the rule reasons.
 */
function ReasonTile({ reason }: { reason: LineupInfeasibilityReason }) {
  const rule = isRuleReason(reason.kind);
  const surface = rule
    ? "border-border bg-surface-muted"
    : "border-warning-border bg-warning-surface";
  return (
    <div
      data-reason={reason.kind}
      className={`flex flex-col gap-2 rounded-r-token border-l-2 px-3 py-2 ${surface}`}
    >
      <span
        className={`text-[12.5px] leading-relaxed ${
          rule ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {reason.message}
      </span>
      {reason.attributed.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {reason.attributed.map((placed, index) => (
            <span
              key={`${placed.name}-${index}`}
              className="flex items-center gap-1.5 rounded-token border border-border bg-surface px-2 py-0.5 text-[12px] text-foreground"
            >
              <span>{placed.name}</span>
              <span
                className={`font-mono text-[10.5px] ${
                  placed.where === "excluded"
                    ? "text-danger"
                    : "text-muted-foreground"
                }`}
              >
                {whereLabel(placed.where)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * No legal lineup exists under these locks and exclusions.
 *
 * A separate panel rather than an empty candidate list: an empty list reads
 * as "searched, found nothing worth showing", which is a different — and
 * here false — claim. This one says the constraints themselves have no
 * solution, and names the line that ran out of partners.
 */
export function NoSolution({
  search,
  lines,
}: {
  search: LineupSearch;
  lines: RuleLine[];
}) {
  const byKey = new Map(search.roster.map((player) => [player.key, player]));
  const placements = Object.entries(search.placements);
  const reasons = [...(search.infeasibility?.reasons ?? [])].sort(
    (a, b) => reasonRank(a.kind) - reasonRank(b.kind),
  );
  // Attribution rides the reasons when we have them; the flat placements list
  // is the fallback for an older backend that only sent infeasible_line.
  const showPlacementsFallback = reasons.length === 0 && placements.length > 0;

  return (
    <section
      aria-label="无解"
      className="flex flex-col gap-3 rounded-token border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[15px] font-semibold text-foreground">
          凑不出合法阵容
        </span>
        <span className="text-[12.5px] leading-relaxed text-muted">
          在当前的锁定与排除下，
          <strong className="text-foreground">
            {lineName(lines, search.infeasible_line ?? "")}没有任何合法搭档
          </strong>
          。
        </span>
        <span className="text-[12.5px] leading-relaxed text-muted">
          这不是「搜索没找到」——这套限制本身就没有解，再等也不会有结果。松开一条锁定，或让一名被排除的队员归队。
        </span>
      </div>

      {reasons.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-foreground">
            为什么这条线凑不出
          </span>
          <div className="flex flex-col gap-2">
            {reasons.map((reason, index) => (
              <ReasonTile key={`${reason.kind}-${index}`} reason={reason} />
            ))}
          </div>
          {/* The same no-blame disclaimer the flat list carried: a named
              player is a fact read off the input, not a claim that undoing
              their exclude or lock is what makes the line solvable. */}
          <span className="text-[12px] leading-relaxed text-muted">
            点名的队员是直接读当前的锁定与排除得到的，不是逐条拆锁重算——系统不声称知道是哪一条锁定「该负责」。
          </span>
        </div>
      ) : null}

      {showPlacementsFallback ? (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-medium text-foreground">
            相关队员现在的去向
          </span>
          <div className="flex flex-wrap gap-1.5">
            {placements.map(([key, where]) => {
              const player = byKey.get(key);
              return (
                <span
                  key={key}
                  className="flex items-center gap-1.5 rounded-token border border-border px-2 py-1 text-[12px] text-foreground"
                >
                  <span>{player ? playerName(player) : key}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {where === "excluded" ? "排除" : `已锁 ${where}`}
                  </span>
                </span>
              );
            })}
          </div>
          {/* Without this the list reads as an accusation. Naming the lock
              responsible would take one full search per lock, and would
              still be wrong whenever several combine to block the line. */}
          <span className="text-[12px] leading-relaxed text-muted">
            这是直接读当前的锁定与排除得到的，不是逐条拆锁重算——系统不声称知道是哪一条锁定「该负责」。
          </span>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A lock the rules themselves forbid.
 *
 * Also not an empty list: "your roster cannot do it" and "you asked for
 * something the rules do not allow" call for different actions.
 */
export function InvalidLocks({ search }: { search: LineupSearch }) {
  return (
    <section
      aria-label="锁定不合法"
      className="flex flex-col gap-2 rounded-token border border-border bg-surface px-4 py-3.5"
    >
      <span className="text-[15px] font-semibold text-foreground">
        这条锁定本身不合法
      </span>
      <ul className="flex flex-col gap-1">
        {search.invalid_locks.map((violation, index) => (
          <li key={index} className="text-[12.5px] leading-relaxed text-muted">
            {violation.message}
          </li>
        ))}
      </ul>
      <span className="text-[12px] leading-relaxed text-muted">
        锁定会跳过逐线筛选，所以这条不会被搜索悄悄丢掉——先改这条锁定，再搜。
      </span>
    </section>
  );
}

/** The search stopped at its node budget, so what it found is a sample. */
export function Truncated() {
  return (
    <section
      aria-label="截断"
      className="flex flex-col gap-1 rounded-token border border-[#e0d3b0] bg-[#fdf8ec] px-4 py-3"
    >
      <span className="text-[13px] font-semibold text-foreground">搜索被截断</span>
      <span className="text-[12px] leading-relaxed text-muted">
        搜索到预算上限就停下了，因此这不是一次完整搜索——可能还有没被看到的阵容。缩小范围（多锁一条线，或排除几名本场不能上的队员）可以让它跑完。
      </span>
    </section>
  );
}

/**
 * The borrowed-player rule was not checked. Stated on every result, with or
 * without candidates: the per-match ceiling depends on how many schools a
 * team combines, which is not in the system, and saying nothing would read
 * as "checked".
 */
export function BorrowedPlayersNotice() {
  return (
    <section
      aria-label="外援"
      className="flex flex-none flex-col gap-1 border-t border-border pt-2"
    >
      <span className="font-mono text-[11px] text-muted-foreground">
        外援限制未校验
      </span>
      <span className="text-[11.5px] leading-relaxed text-muted-foreground">
        外援有每队名额与每场上场人数限制，但每场上限取决于该队由几所学校组成，这个信息不在系统里。以上阵容没有对这一条做过检查。
      </span>
    </section>
  );
}

/**
 * How many of this team's players the search could not use at all.
 *
 * Neutral, not warning: nothing is wrong — those players simply have no
 * participation UTR yet. But the ceiling and every candidate below are
 * computed over the rest, so leaving it unsaid would quietly widen "the best
 * this team can do" into "the best some of them can do".
 */
export function MissingUtrNotice({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <p
      aria-label="未参与计算"
      className="flex-none rounded-token border border-border bg-surface-muted px-3.5 py-2 text-[12px] leading-relaxed text-foreground"
    >
      本队 {count} 人因缺少参赛 UTR 未参与计算
    </p>
  );
}

/**
 * Season values with two candidates and no ruling.
 *
 * Reading the larger one is the safe direction — the participation UTR is an
 * upper bound, so reading low would call an illegal lineup legal — but a
 * reader is entitled to know which of the two they are looking at.
 */
export function UnresolvedNotice({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <p
      aria-label="未裁决"
      className="flex-none rounded-token border border-warning-border bg-warning-surface px-3.5 py-2 text-[12px] leading-relaxed text-warning"
    >
      本结果含 {count} 名参赛 UTR 未裁决的队员，按较大值计算
    </p>
  );
}

/**
 * A shared link built before the player keys changed shape.
 *
 * Neutral rather than danger: nothing dangerous happened, the link is simply
 * from before. What matters is that the page does not quietly drop the locks
 * and show a full candidate list — that result would look entirely healthy
 * while answering a question nobody asked.
 */
export function StaleLink({ resetHref }: { resetHref: string }) {
  return (
    <section
      aria-label="旧链接"
      className="flex flex-none flex-col items-start gap-2 rounded-token border border-border bg-surface px-4 py-3.5"
    >
      <span className="text-[13px] font-semibold text-foreground">
        这个链接是旧格式（队员编号已变），请重新选择锁定的搭档
      </span>
      <span className="text-[12px] leading-relaxed text-muted">
        队员编号在这次改版里换了形式，旧链接里的编号已经指不到人了。系统不会拿它去猜——猜错的那套阵容看起来会完全正常。
      </span>
      <a
        href={resetHref}
        className="rounded-token border border-border px-2.5 py-1 text-[12px] text-foreground hover:bg-surface-muted"
      >
        清空锁定，重新选择
      </a>
    </section>
  );
}
