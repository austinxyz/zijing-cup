"use client";

import { useState } from "react";

import { Badge } from "@/components/ui";
import type { RosterPlayer } from "@/lib/api";
import { playerName } from "@/lib/name";

/** The committee's own class for a participation value.
 *
 *  null maps to nothing on purpose. Whether an unclassified player is
 *  committee-adjudicated or captain-rated depends on USTA match history
 *  nobody has recorded, and naming a class here would settle who counts
 *  against the "at most two self-rated on court, never partnered" cap — a
 *  decision this page is in no position to make. */
const CLASS_LABEL: Record<string, string> = {
  verified: "已认证",
  committee: "委员会审定",
  captain: "队长评定",
};

const GENDER_LABEL: Record<string, string> = { M: "男", F: "女" };

/** What to say about a value that is not this season's frozen one.
 *
 *  The year is part of the label, not decoration: deriving 2026 from 2025 and
 *  from 2023 are two different degrees of confidence, and a bare 「估算」
 *  would present them as the same claim. */
function estimateLabel(
  origin: string | null,
  originYear: number | null,
): string | null {
  if (origin === "current_doubles") return "估算 · 当前已认证值";
  if (origin === "prior_season" && originYear !== null) {
    return `估算 · ${originYear} 参赛值`;
  }
  return null;
}

export interface CurrentUtrEdit {
  player_id: number;
  singles_utr: string | null;
  singles_status: string | null;
  doubles_utr: string | null;
  doubles_status: string | null;
}

/**
 * The roster, and — for a signed-in admin — a way to fix one player's current
 * UTR without a round trip through the sheet.
 *
 * One player at a time on purpose. Editing several at once is what the batch
 * sheet is for, and two routes to the same job leave nobody sure which one to
 * reach for.
 *
 * `canEdit` hides the control; it is not the protection. The write endpoint
 * refuses an unauthenticated caller on its own. This half keeps the page from
 * offering a button that cannot work.
 */
export function RosterTable({
  players,
  canEdit = false,
  onSave,
}: {
  players: RosterPlayer[];
  canEdit?: boolean;
  onSave?: (edit: CurrentUtrEdit) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <div>
      {/* Beside the columns, not in a footer: a number that looks official
          gets used as official, and these are typed in by hand in the admin
          screens with nothing syncing them. Today the two columns are
          entirely 「—」, which without this line reads as a broken page. */}
      <p className="border-b border-border bg-surface-muted px-3.5 py-1.5 text-[11px] text-foreground">
        当前 UTR 由人工维护，未与 UTR 官网同步
      </p>
      <table className="w-full table-fixed border-collapse bg-surface">
      <colgroup>
        <col className="w-12" />
        <col className="w-[168px]" />
        <col className="w-16" />
        <col className="w-[104px]" />
        <col />
        {/* Wide enough for the number field and its status together: the
            cells clip their overflow, so a column that is merely close makes
            the controls look cut off. */}
        <col className="w-[184px]" />
        <col className="w-[184px]" />
        {canEdit ? <col className="w-[64px]" /> : null}
      </colgroup>
      <thead>
        <tr>
          <Th>#</Th>
          <Th>姓名</Th>
          <Th>性别</Th>
          <Th>参赛 UTR</Th>
          <Th>UTR 来源</Th>
          <Th>当前单打</Th>
          <Th>当前双打</Th>
          {canEdit ? <Th> </Th> : null}
        </tr>
      </thead>
      <tbody>
        {/* Rendered in the order received. The backend returns strongest
            first with ties broken by surname; re-sorting here would be a
            second opinion on the same question, and ties are common — several
            players sit on the same cap. */}
        {players.map((player, index) => (
          // Keyed by id, not by name: names repeat on a real roster, and a
          // key that collides makes React reuse the wrong row's state — which
          // here is which row is being edited.
          <tr key={player.player_id}>
            <Td className="font-mono text-xs text-muted-foreground">
              {index + 1}
            </Td>
            <Td className="text-[13px] text-foreground">
              {playerName(player)}
            </Td>
            <Td className="text-[12.5px] text-muted">
              {player.gender ? GENDER_LABEL[player.gender] ?? player.gender : ""}
            </Td>
            {/* A decimal string all the way through: 10.25 and 10.2 are
                different answers against a cap. */}
            <Td className="font-mono text-[12.5px] text-foreground">
              <UtrCell player={player} />
            </Td>
            <Td>
              <SourceCell
                ratingClass={player.rating_class}
                underAppeal={player.under_appeal}
              />
            </Td>
            {editing === player.player_id ? (
              <EditableCells
                player={player}
                onSave={(edit) => {
                  onSave?.(edit);
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <Td className="font-mono text-[12.5px] text-muted">
                  <CurrentUtrCell
                    value={player.singles_utr}
                    status={player.singles_status}
                  />
                </Td>
                <Td className="font-mono text-[12.5px] text-muted">
                  <CurrentUtrCell
                    value={player.doubles_utr}
                    status={player.doubles_status}
                  />
                </Td>
                {canEdit ? (
                  <Td>
                    <button
                      type="button"
                      onClick={() => setEditing(player.player_id)}
                      className="rounded-token border border-border bg-surface px-2 py-0.5 text-[11.5px] text-foreground"
                    >
                      改
                    </button>
                  </Td>
                ) : null}
              </>
            )}
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

const STATUSES = ["", "unrated", "projected", "rated"] as const;

const DEFAULT_STATUS = "rated";

/**
 * One row, mid-edit.
 *
 * The id travels with the save, never the name: names repeat on a real
 * roster, and this is the same identity the batch sheet round-trips.
 */
function EditableCells({
  player,
  onSave,
}: {
  player: RosterPlayer;
  onSave: (edit: CurrentUtrEdit) => void;
}) {
  // Empty rows start at `rated`: a number checked by hand against the UTR
  // site is almost always a rated one, and asking for it every time is a
  // second field for a decision the person already made. An existing status
  // is kept — that one somebody chose.
  const [singles, setSingles] = useState(player.singles_utr ?? "");
  const [singlesStatus, setSinglesStatus] = useState(
    player.singles_status ?? DEFAULT_STATUS,
  );
  const [doubles, setDoubles] = useState(player.doubles_utr ?? "");
  const [doublesStatus, setDoublesStatus] = useState(
    player.doubles_status ?? DEFAULT_STATUS,
  );

  return (
    <>
      <Td className="font-mono text-[12.5px]">
        <PairInputs
          value={singles}
          status={singlesStatus}
          onValue={setSingles}
          onStatus={setSinglesStatus}
          label="当前单打"
        />
      </Td>
      <Td className="font-mono text-[12.5px]">
        <PairInputs
          value={doubles}
          status={doublesStatus}
          onValue={setDoubles}
          onStatus={setDoublesStatus}
          label="当前双打"
        />
      </Td>
      <Td>
        <button
          type="button"
          onClick={() =>
            onSave({
              player_id: player.player_id,
              singles_utr: singles === "" ? null : singles,
              singles_status: singlesStatus === "" ? null : singlesStatus,
              doubles_utr: doubles === "" ? null : doubles,
              doubles_status: doublesStatus === "" ? null : doublesStatus,
            })
          }
          className="rounded-token bg-primary px-2 py-0.5 text-[11.5px] text-primary-foreground"
        >
          存
        </button>
      </Td>
    </>
  );
}

/** A UTR and its status, which only mean anything together. */
function PairInputs({
  value,
  status,
  onValue,
  onStatus,
  label,
}: {
  value: string;
  status: string;
  onValue: (next: string) => void;
  onStatus: (next: string) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        aria-label={label}
        value={value}
        onChange={(event) => onValue(event.target.value)}
        className="w-[58px] rounded border border-foreground bg-surface px-1.5 py-0.5 font-mono text-[11.5px]"
      />
      <select
        aria-label={`${label}状态`}
        value={status}
        onChange={(event) => onStatus(event.target.value)}
        className="rounded border border-foreground bg-surface px-1 py-0.5 text-[11px]"
      >
        {STATUSES.map((option) => (
          <option key={option} value={option}>
            {option === "" ? "—" : option}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A live UTR, in UTR's own vocabulary.
 *
 * The status is shown rather than translated: `rated` / `projected` /
 * `unrated` are the words the site itself uses, and step two of the
 * derivation chain turns on exactly which one it is.
 */
function CurrentUtrCell({
  value,
  status,
}: {
  value: string | null;
  status: string | null;
}) {
  if (value === null) {
    // An em dash, not an empty cell: today every row is like this, and a
    // column of blanks reads as a page that failed to load.
    // `text-muted`, not `text-muted-foreground`: the lighter one measures
    // 2.5:1 on white, and this dash is the cell's whole content.
    return <span className="text-muted">—</span>;
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex-none text-foreground">{value}</span>
      {status !== null ? (
        <span className="truncate text-[10.5px] text-muted-foreground">
          {status}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The number, and whether it is really this season's.
 *
 * A derived value sits where its size puts it in the ordering, so without a
 * mark it is indistinguishable from a frozen one — and the whole lineup's
 * legality is computed from these numbers.
 */
function UtrCell({ player }: { player: RosterPlayer }) {
  if (player.match_utr === null) {
    // He is on the team, so he is here. A blank cell reads as a broken page
    // and a 0 reads as a real, very low rating.
    return (
      <Badge variant="neutral" className="h-5 px-[7px] font-sans text-[11px]">
        无参赛 UTR
      </Badge>
    );
  }

  const estimate = estimateLabel(player.origin, player.origin_year);

  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* A decimal string all the way through: 10.25 and 10.2 are different
          answers against a cap. */}
      <span className="flex-none">{player.match_utr}</span>
      {estimate !== null ? (
        <Badge
          variant="warning-subtle"
          className="h-5 flex-none px-[7px] text-[11px] font-sans"
        >
          {estimate}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * The class the committee settled on, if it settled on one.
 *
 * The sheet's own status word used to sit beside this as evidence. The
 * registry does not store it, so there is nothing to show next to 「待定」
 * any more — which makes it all the more important that 「待定」 is never
 * quietly upgraded to a concrete class.
 */
function SourceCell({
  ratingClass,
  underAppeal,
}: {
  ratingClass: string | null;
  underAppeal: boolean;
}) {
  const label = ratingClass === null ? null : CLASS_LABEL[ratingClass] ?? null;

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
      {/* Appeal rides on top of the class rather than replacing it: the real
          sheet had Rated / Appeal, Projected / Appeal and Unrated / Appeal. */}
      {underAppeal ? (
        // `text-muted`, not `text-muted-foreground`: at 11px the lighter one
        // measures 2.79:1 on this background, and Appeal is a claim about the
        // value, not decoration.
        <span className="flex-none text-[11px] text-muted">· Appeal</span>
      ) : null}
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
