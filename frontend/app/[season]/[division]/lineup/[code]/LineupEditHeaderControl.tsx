"use client";

import { EditModeToggle } from "./EditModeToggle";
import { useLineupEdit } from "./LineupEditContext";

/**
 * The lineup page header's edit control, mirroring the team page:
 * - Not signed in → the in-place password unlock (`EditModeToggle`); on success
 *   the page refreshes and `canEdit` becomes true.
 * - Signed in → a 编辑模式 / 查看模式 toggle that shows or hides the edit
 *   affordances (saved-lineup controls, preset save/delete, save-this-lineup),
 *   plus the logout affordance.
 */
export function LineupEditHeaderControl() {
  const { canEdit, editing, setEditing } = useLineupEdit();

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
