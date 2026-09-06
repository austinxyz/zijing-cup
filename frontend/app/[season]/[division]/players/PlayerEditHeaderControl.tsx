"use client";

import { EditModeToggle } from "@/app/[season]/[division]/lineup/[code]/EditModeToggle";
import { usePlayerEdit } from "./PlayerEditContext";

/**
 * The player workbench header's edit control, mirroring the team page:
 * - Cannot edit → the in-place password unlock (`EditModeToggle`); on success
 *   the page refreshes and `canEdit` becomes true.
 * - Can edit → a 编辑模式 / 查看模式 toggle (shows or hides the write controls
 *   below), plus the logout affordance from EditModeToggle.
 */
export function PlayerEditHeaderControl({
  season,
  division,
}: {
  season: string;
  division: string;
}) {
  const { canEdit, editing, setEditing } = usePlayerEdit();

  if (!canEdit) {
    return <EditModeToggle signedIn={false} season={season} division={division} />;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(!editing)}
        className="min-h-9 rounded-token border border-border bg-surface-muted px-2.5 py-1 text-[12px] text-foreground"
      >
        {editing ? "查看模式" : "编辑模式"}
      </button>
      <EditModeToggle signedIn={true} season={season} division={division} />
    </div>
  );
}
