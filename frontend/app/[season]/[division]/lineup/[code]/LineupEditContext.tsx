"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface LineupEditState {
  /** Whether the viewer holds an admin session (can edit at all). */
  canEdit: boolean;
  /** Whether the edit affordances are currently shown. Only meaningful when
   *  canEdit. */
  editing: boolean;
  setEditing: (v: boolean) => void;
}

/**
 * Default `editing: true` on purpose: a component rendered WITHOUT a provider
 * (the standalone /saved page renders SavedLineups directly) must keep showing
 * its admin controls exactly as before — the edit/view switch is an addition to
 * the main lineup page, not a new gate everywhere. The main page's provider
 * starts `editing: false`, so an admin lands on the same read view everyone
 * sees and opts into editing, mirroring the team page.
 */
const LineupEditCtx = createContext<LineupEditState>({
  canEdit: false,
  editing: true,
  setEditing: () => {},
});

export function LineupEditProvider({
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
    <LineupEditCtx.Provider value={{ canEdit, editing, setEditing }}>
      {children}
    </LineupEditCtx.Provider>
  );
}

export const useLineupEdit = () => useContext(LineupEditCtx);
