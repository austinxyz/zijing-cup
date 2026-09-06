import type { Player, PlayerSeasonUtr } from "@/lib/api";
import { playerName } from "@/lib/name";

import { savePlayerFields } from "./actions";
import { PlayerProfileSection } from "./PlayerProfileSection";
import { PlayerDetailActions } from "./PlayerDetailActions";

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
  "inline-flex items-center rounded-full border border-[#cfe1d6] bg-[#eef4f0] px-2 py-px text-[11px] leading-relaxed text-[#3b6e4f]";

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

/**
 * A player's full detail, shared by the workbench right pane (index page, via
 * `?sel`) and the standalone `[id]` route (deep link). Read-only by default;
 * the 基本信息 section and the action row reveal their edit affordances only in
 * edit mode (via `PlayerEditContext`).
 */
export function PlayerDetail({
  player,
  season,
  division,
}: {
  player: Player;
  season: string;
  division: string;
}) {
  const contested = player.season_utrs.find((utr) => utr.is_unresolved);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-none flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground">
          {playerName(player)}
        </h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          player #{player.id} ·{" "}
          {player.season_utrs.length > 0
            ? player.season_utrs.map((u) => u.season_year).join(" / ")
            : "尚无赛季记录"}
        </span>
      </div>

      {/* Until the read path moves to these tables, the roster and lineup pages
          still read the old snapshot. An edit that appears to do nothing reads
          as a broken save unless the page says why. */}
      <div className="flex-none rounded-token border border-border bg-surface-muted px-3.5 py-2.5 text-[12px] leading-relaxed text-muted">
        这里的修改暂时还不会出现在<strong>名单页与排阵页</strong>上——那两个页面读的
        仍是旧的名单快照，读取路径会在下一个改动里切过来。
      </div>

      {contested ? <Unresolved utr={contested} /> : null}

      <PlayerProfileSection
        player={player}
        season={season}
        division={division}
        saveAction={savePlayerFields}
      />

      <section
        aria-label="各赛季参赛 UTR"
        className="flex flex-none flex-col rounded-token border border-border bg-surface"
      >
        <div className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
          各赛季参赛 UTR
        </div>
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
                  {utr.alt_value ? (
                    <span className="text-muted-foreground"> / {utr.alt_value}</span>
                  ) : null}
                </td>
                <td className="border-b border-border px-3.5 py-2 text-[12.5px]">
                  <span className={utr.status ? OK : TAG}>
                    {SEASON_STATUS_LABEL[utr.status ?? ""] ?? "待定"}
                  </span>{" "}
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
      </section>

      <section
        aria-label="队伍成员关系"
        className="flex flex-none flex-col rounded-token border border-border bg-surface"
      >
        <div className="border-b border-border px-3.5 py-2.5 text-[12.5px] font-semibold text-foreground">
          队伍成员关系
        </div>
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
          <strong>队伍加入 / 移出</strong>在队伍页维护（本页只读显示）。<strong>外援</strong>
          受名额与每场上场人数限制、系统<strong>不校验</strong>；<strong>外卡</strong>不属于
          当前学校、需组委会同意，不影响上场资格。两者不要混。
        </div>
      </section>

      <PlayerDetailActions
        season={season}
        division={division}
        playerId={player.id}
        hasContested={contested !== undefined}
      />
    </div>
  );
}
