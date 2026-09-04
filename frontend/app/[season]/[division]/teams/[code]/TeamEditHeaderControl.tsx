"use client";

import { EditModeToggle } from "@/app/[season]/[division]/lineup/[code]/EditModeToggle";
import { useTeamEdit } from "./TeamEditContext";

/**
 * The team-name row's far-right control:
 * - Not signed in → the in-place password unlock (`EditModeToggle`); on success
 *   the page refreshes and `canEdit` becomes true.
 * - Signed in → a 编辑模式 / 查看模式 toggle (switches the roster panel below),
 *   plus the logout affordance from EditModeToggle.
 */
export function TeamEditHeaderControl() {
  const { canEdit, editing, setEditing } = useTeamEdit();

  if (!canEdit) {
    return <EditModeToggle signedIn={false} />;
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
      <EditModeToggle signedIn={true} />
    </div>
  );
}
