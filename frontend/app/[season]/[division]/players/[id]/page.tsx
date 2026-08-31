import { notFound } from "next/navigation";

import { getPlayer, type Player, type PlayerSeasonUtr } from "@/lib/api";
import { playerName } from "@/lib/name";

interface PageProps {
  params: Promise<{ season: string; division: string; id: string }>;
}

const SEASON_STATUS_LABEL: Record<string, string> = {
  verified: "已认证",
  committee: "组委会审定",
  captain: "队长评定",
};
const SOURCE_LABEL: Record<string, string> = {
  prefilled: "预填",
  committee_sheet: "组委会总表",
  admin_ruling: "admin 裁决",
};

const TAG =
  "inline-flex items-center rounded-full border border-border bg-surface px-2 py-px text-[11px] leading-relaxed text-muted";
const WARN =
  "inline-flex items-center rounded-full border border-warning-border bg-warning-surface px-2 py-px text-[11px] leading-relaxed text-warning";
const OK =
  "inline-flex items-center rounded-full border border-[#cfe1d6] bg-[#eef4f0] px-2 py-px text-[11px] leading-relaxed text-success";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-muted">{label}</span>
      <div className="flex h-8 items-center rounded-token border border-border bg-surface px-2.5 text-[12.5px] text-foreground">
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  label,
  children,
  aside,
}: {
  title: string;
  label: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-none flex-col rounded-token border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Unresolved({ utr }: { utr: PlayerSeasonUtr }) {
  return (
    <section
      aria-label="未裁决"
      className="flex flex-none gap-2.5 rounded-token border border-warning-border bg-warning-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-[#6f5206]"
    >
      <span>
        <strong>{utr.season_year} 的参赛 UTR 尚未裁决</strong>：两份总表分别记了{" "}
        {utr.value} 与 {utr.alt_value}，冻结时点不同。裁决之前一律按{" "}
        <strong>{utr.value}</strong>（较大值）参与计算——取小会把一套其实违规的阵容
        显示成合法，到赛场才暴露。
      </span>
    </section>
  );
}

export default async function PlayerDetailPage({ params }: PageProps) {
  const { season, division, id } = await params;

  const player: Player | null = await getPlayer(id);
  if (player === null) notFound();

  const contested = player.season_utrs.find((utr) => utr.is_unresolved);

  return (
    <main className="flex flex-1 min-w-0 flex-col overflow-hidden bg-background">
      <div className="flex flex-none items-center justify-between gap-2.5 border-b border-border bg-surface px-5 py-[11px]">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="text-base font-semibold text-foreground">
            {playerName(player)}
          </h1>
          <span className="font-mono text-[11px] text-muted-foreground">
            player #{player.id} ·{" "}
            {player.season_utrs.length > 0
              ? player.season_utrs.map((u) => u.season_year).join(" / ")
              : "尚无赛季记录"}
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4">
        {/* Until the read path moves to these tables, the roster and lineup
            pages still read the old snapshot. An edit that appears to do
            nothing reads as a broken save unless the page says why. */}
        <div className="flex-none rounded-token border border-border bg-surface-muted px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
          这里的修改暂时还不会出现在<strong>名单页与排阵页</strong>上——那两个页面读的
          仍是旧的名单快照，读取路径会在下一个改动里切过来。
        </div>

        {contested ? <Unresolved utr={contested} /> : null}

        <Section title="基本信息" label="基本信息" aside={<span className={TAG}>跨赛季，与队伍无关</span>}>
          <div className="grid grid-cols-4 gap-3 px-3.5 py-3">
            <Field label="姓">{player.last_name}</Field>
            <Field label="名">{player.first_name}</Field>
            <Field label="性别">
              {player.gender === "M" ? "男" : player.gender === "F" ? "女" : "—"}
            </Field>
            <Field label="UTR 链接">
              {player.utr_profile_id ? (
                <span className="font-mono text-[11.5px]">
                  …/profiles/{player.utr_profile_id}
                </span>
              ) : (
                <span className="text-muted-foreground">未填</span>
              )}
            </Field>
            <Field label="当前单打 UTR">
              <span className="font-mono">{player.singles_utr ?? "—"}</span>
            </Field>
            <Field label="单打状态">{player.singles_status ?? "—"}</Field>
            <Field label="当前双打 UTR">
              <span className="font-mono">{player.doubles_utr ?? "—"}</span>
            </Field>
            <Field label="双打状态">{player.doubles_status ?? "—"}</Field>
          </div>
        </Section>

        <Section title="各赛季参赛 UTR" label="各赛季参赛 UTR">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["赛季", "参赛 UTR", "状态", "来源", "说明"].map((head) => (
                  <th
                    key={head}
                    className="border-b border-border px-3.5 py-[7px] text-left font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {player.season_utrs.map((utr) => (
                <tr key={utr.season_year}>
                  <td className="border-b border-border px-3.5 py-2 font-mono text-[12.5px]">
                    {utr.season_year}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 font-mono text-[12.5px]">
                    {utr.value}
                    {/* Both candidates: a ruling picks between two specific
                        numbers, and one of them alone cannot be judged. */}
                    {utr.alt_value ? (
                      <span className="text-muted-foreground"> / {utr.alt_value}</span>
                    ) : null}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    <span className={utr.status ? OK : TAG}>
                      {SEASON_STATUS_LABEL[utr.status ?? ""] ?? "待定"}
                    </span>{" "}
                    {/* Appeal rides on top of the status instead of replacing
                        it — the sheet has it on all three. */}
                    {utr.under_appeal ? <span className={WARN}>Appeal</span> : null}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    <span className={utr.source === "prefilled" ? WARN : TAG}>
                      {SOURCE_LABEL[utr.source] ?? utr.source}
                    </span>
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12px] text-muted">
                    {utr.is_unresolved ? "两份总表不一致，需裁决" : ""}
                  </td>
                </tr>
              ))}
              {player.season_utrs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3.5 py-4 text-center text-[12.5px] text-muted">
                    还没有任何赛季的参赛 UTR。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Section>

        <Section title="队伍成员关系" label="队伍成员关系">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["赛季", "组别", "队伍", "代表学校", "外援", "外卡"].map((head) => (
                  <th
                    key={head}
                    className="border-b border-border px-3.5 py-[7px] text-left font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {player.memberships.map((membership) => (
                <tr key={membership.id}>
                  <td className="border-b border-border px-3.5 py-2 font-mono text-[12.5px]">
                    {membership.season_year}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    {membership.division_code === "gold" ? "金组" : "银组"}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    {membership.team_code}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    {membership.representing_school ?? "—"}
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    <span className={TAG}>
                      {membership.is_borrowed_player === null
                        ? "未标"
                        : membership.is_borrowed_player
                          ? "是"
                          : "否"}
                    </span>
                  </td>
                  <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                    <span className={TAG}>
                      {membership.is_wildcard === null
                        ? "未标"
                        : membership.is_wildcard
                          ? "是"
                          : "否"}
                    </span>
                  </td>
                </tr>
              ))}
              {player.memberships.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3.5 py-4 text-center text-[12.5px] text-muted">
                    这名队员目前不属于任何队伍。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="border-t border-border px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
            <strong>外援</strong>受规则的名额与每场上场人数限制，但系统
            <strong>不校验</strong>这一条（每场上限取决于该队由几所学校组成，这个信息不在
            系统里），排阵结果始终标注「外援限制未校验」。<strong>外卡</strong>表示不属于
            当前学校、需组委会同意，<strong>不影响上场资格</strong>。两者不要混。
          </div>
        </Section>
      </div>
    </main>
  );
}
