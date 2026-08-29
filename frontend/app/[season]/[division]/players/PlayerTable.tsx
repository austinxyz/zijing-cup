import Link from "next/link";

import type { Player } from "@/lib/api";
import { playerName } from "@/lib/name";

const GENDER_LABEL: Record<string, string> = { M: "男", F: "女" };

/** Warning tier: "the committee has not confirmed this number." */
const UNCONFIRMED =
  "inline-flex items-center rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] leading-relaxed text-[#8a6508]";
const QUIET =
  "inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] leading-relaxed text-muted-foreground";
const SETTLED =
  "inline-flex items-center rounded-full border border-[#cfe1d6] bg-[#eef4f0] px-2 py-px text-[11px] leading-relaxed text-success";

const SEASON_STATUS_LABEL: Record<string, string> = {
  verified: "已认证",
  committee: "组委会审定",
  captain: "队长评定",
};

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-border px-2.5 py-[7px] text-left font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-2.5 py-2 text-[12.5px] ${className}`}>
      {children}
    </td>
  );
}

function CurrentUtr({ value, status }: { value: string | null; status: string | null }) {
  return (
    <span className="font-mono">
      {value ?? <span className="text-muted-foreground">—</span>}{" "}
      {status ? <span className={QUIET}>{status}</span> : null}
    </span>
  );
}

/**
 * The participation value, with whatever qualifies it.
 *
 * `未裁决` and `预填` share one visual tier because they are one fact: the
 * committee has not confirmed this number. Splitting them into two severities
 * would suggest a difference in how much the number can be trusted, and there
 * isn't one.
 */
function SeasonUtr({ player }: { player: Player }) {
  const latest = player.season_utrs[0];
  if (!latest) {
    return <span className="font-mono text-muted-foreground">未录入</span>;
  }

  const qualifier = latest.is_unresolved
    ? "未裁决"
    : latest.source === "prefilled"
      ? "预填"
      : SEASON_STATUS_LABEL[latest.status ?? ""] ?? "待定";

  const settled = !latest.is_unresolved && latest.source !== "prefilled";

  return (
    <span className="font-mono">
      {latest.season_year} · {latest.value}{" "}
      <span className={settled ? SETTLED : UNCONFIRMED}>{qualifier}</span>
    </span>
  );
}

export function PlayerTable({
  players,
  season,
  division,
}: {
  players: Player[];
  season: string;
  division: string;
}) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <Th className="w-[34px]">#</Th>
          <Th>姓名</Th>
          <Th className="w-[52px]">性别</Th>
          <Th className="w-[110px]">当前单打</Th>
          <Th className="w-[110px]">当前双打</Th>
          <Th className="w-[190px]">参赛 UTR</Th>
          <Th>所在队伍</Th>
          <Th className="w-[78px]">UTR 链接</Th>
        </tr>
      </thead>
      <tbody>
        {players.map((player, index) => (
          <tr key={player.id}>
            <Td className="font-mono text-muted-foreground">{index + 1}</Td>
            <Td className="text-foreground">
              <Link
                href={`/${season}/${division}/players/${player.id}`}
                className="text-foreground no-underline hover:underline"
              >
                {playerName(player)}
              </Link>
            </Td>
            <Td className="text-muted">
              {player.gender ? GENDER_LABEL[player.gender] ?? player.gender : "—"}
            </Td>
            <Td>
              <CurrentUtr value={player.singles_utr} status={player.singles_status} />
            </Td>
            <Td>
              <CurrentUtr value={player.doubles_utr} status={player.doubles_status} />
            </Td>
            <Td>
              <SeasonUtr player={player} />
            </Td>
            <Td className="text-muted">
              {/* Every team, not the first one: the rules let one person play
                  gold and silver in the same season, and 82 of the 83 repeated
                  names in the 2025 data are exactly that. */}
              {player.memberships.length === 0 ? (
                <span className="text-muted-foreground">未入队</span>
              ) : (
                player.memberships.map((m) => m.team_code).join(" · ")
              )}
            </Td>
            <Td>
              {player.utr_profile_id ? (
                <span className={SETTLED}>有</span>
              ) : (
                // Not an error state: nobody has filled it in yet. It is also
                // the only evidence a future merge could rest on, so it has to
                // be visible rather than blank.
                <span className={QUIET}>无</span>
              )}
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
