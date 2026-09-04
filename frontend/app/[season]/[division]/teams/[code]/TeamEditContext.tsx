"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface TeamEditState {
  /** Whether the viewer holds an admin session (can edit at all). */
  canEdit: boolean;
  /** Whether the edit view is currently shown (only meaningful when canEdit). */
  editing: boolean;
  setEditing: (v: boolean) => void;
}

const TeamEditCtx = createContext<TeamEditState>({
  canEdit: false,
  editing: false,
  setEditing: () => {},
});

/**
 * Shares the edit/view toggle between the header control (which lives up in the
 * team-name row) and the roster panel below it, so one switch drives both. Edit
 * starts off — an admin lands on the same read view everyone else sees and opts
 * into editing.
 */
export function TeamEditProvider({
  canEdit,
  children,
  initialEditing = false,
}: {
  canEdit: boolean;
  children: ReactNode;
  /** Start in edit view — used by tests; the UI always opts in via the toggle. */
  initialEditing?: boolean;
}) {
  const [editing, setEditing] = useState(initialEditing);
  return (
    <TeamEditCtx.Provider value={{ canEdit, editing, setEditing }}>
      {children}
    </TeamEditCtx.Provider>
  );
}

export const useTeamEdit = () => useContext(TeamEditCtx);
