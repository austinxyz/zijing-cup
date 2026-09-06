"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface PlayerEditState {
  /** Whether the viewer holds edit rights for this competition. */
  canEdit: boolean;
  /** Whether the edit affordances are currently shown. Only meaningful when
   *  canEdit. */
  editing: boolean;
  setEditing: (v: boolean) => void;
}

/**
 * Default `editing: false` — the player workbench carries irreversible actions
 * (merge / split), so even an editor lands on the same read view everyone sees
 * and opts into editing via the toggle. (The lineup page defaults its provider
 * to view too; only components rendered without a provider keep controls.)
 */
const PlayerEditCtx = createContext<PlayerEditState>({
  canEdit: false,
  editing: false,
  setEditing: () => {},
});

export function PlayerEditProvider({
  canEdit,
  children,
  initialEditing = false,
}: {
  canEdit: boolean;
  children: ReactNode;
  /** Start in edit view — used by tests; the UI opts in via the toggle. */
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  return (
    <PlayerEditCtx.Provider value={{ canEdit, editing, setEditing }}>
      {children}
    </PlayerEditCtx.Provider>
  );
}

export const usePlayerEdit = () => useContext(PlayerEditCtx);

/**
 * Renders its children only when the viewer can edit AND is in edit mode.
 *
 * The single gate for every write control in the workbench: view mode (or a
 * viewer without edit rights) shows no write affordances at all, so a read-only
 * visitor never sees a control that would 4xx on click.
 */
export function EditOnly({ children }: { children: ReactNode }) {
  const { canEdit, editing } = usePlayerEdit();
  if (!canEdit || !editing) return null;
  return <>{children}</>;
}
