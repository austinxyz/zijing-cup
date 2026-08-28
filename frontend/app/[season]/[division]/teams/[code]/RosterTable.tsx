import { Badge } from "@/components/ui";
import type { RosterPlayer } from "@/lib/api";

/** The sheet's status word -> the class we are willing to state.
 *
 *  `Unrated` is deliberately absent. Whether such a player is
 *  committee-adjudicated or self-rated depends on USTA match history the
 *  committee sheet does not carry, and naming a class here would settle who
 *  counts against the "at most two self-rated on court, never partnered"
 *  cap — a decision this page is in no position to make. */
const CLASS_LABEL: Record<string, string> = {
  Rated: "已认证",
  Projected: "委员会审定",
};

const GENDER_LABEL: Record<string, string> = { M: "男", F: "女" };

/** Classify by the status word, ignoring any "/ Appeal" suffix: the suffix
 *  records a manual adjustment, not a different class. */
function classLabel(status: string): string | null {
  return CLASS_LABEL[status.split("/")[0].trim()] ?? null;
}

export function RosterTable({ players }: { players: RosterPlayer[] }) {
  return (
    <table className="w-full table-fixed border-collapse bg-surface">
      <colgroup>
        <col className="w-12" />
        <col className="w-[168px]" />
        <col className="w-16" />
        <col className="w-[104px]" />
        <col />
      </colgroup>
      <thead>
        <tr>
          <Th>#</Th>
          <Th>姓名</Th>
          <Th>性别</Th>
          <Th>参赛 UTR</Th>
          <Th>UTR 来源</Th>
        </tr>
      </thead>
      <tbody>
        {/* Rendered in the order received. The backend returns strongest
            first with ties broken by surname; re-sorting here would be a
            second opinion on the same question, and ties are common — several
            players sit on the same cap. */}
        {players.map((player, index) => (
          <tr key={`${player.last_name}${player.first_name}-${index}`}>
            <Td className="font-mono text-xs text-muted-foreground">
              {index + 1}
            </Td>
            <Td className="text-[13px] text-foreground">
              {player.last_name}
              {player.first_name}
            </Td>
            <Td className="text-[12.5px] text-muted">
              {player.gender ? GENDER_LABEL[player.gender] ?? player.gender : ""}
            </Td>
            {/* A decimal string all the way through: 10.25 and 10.2 are
                different answers against a cap. */}
            <Td className="font-mono text-[12.5px] text-foreground">
              {player.match_utr}
            </Td>
            <Td>
              <SourceCell status={player.dutr_status} />
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * What we concluded, next to what the sheet actually said.
 *
 * Both, because the conclusion is the useful part and the original is the
 * evidence for it — and because when the conclusion is 「待定」 the original
 * is the only thing on the row with any information in it.
 */
function SourceCell({ status }: { status: string }) {
  const label = classLabel(status);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {label === null ? (
        <Badge
          variant="warning-subtle"
          className="h-5 flex-none px-[7px] text-[12.5px]"
        >
          待定
        </Badge>
      ) : (
        <span className="flex-none text-[12.5px] text-foreground">{label}</span>
      )}
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {status}
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    // Sticky because the longest 2025 rosters run to 26 players: once the
    // labels scroll away there is nothing to tell 参赛 UTR from the other
    // numeric column.
    <th className="sticky top-0 z-10 h-[34px] whitespace-nowrap border-b border-border bg-surface-muted px-3.5 text-left font-mono text-[11px] font-medium tracking-wide text-muted">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={`h-10 overflow-hidden border-b border-[#eae7e0] px-3.5 align-middle ${className}`}
    >
      {children}
    </td>
  );
}
