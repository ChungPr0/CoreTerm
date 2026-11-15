import React, { createContext, useCallback, useContext, useState } from "react";
import type { ContextMenuEntry } from "./ContextMenu";

export interface MenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

interface ContextMenuContextValue {
  menu: MenuState | null;
  setMenu: React.Dispatch<React.SetStateAction<MenuState | null>>;
  openMenu: (x: number, y: number, items: ContextMenuEntry[]) => void;
  closeMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export const ContextMenuProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const openMenu = useCallback((x: number, y: number, items: ContextMenuEntry[]) => {
    setMenu(items.length > 0 ? { x, y, items } : null);
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  return (
    <ContextMenuContext.Provider value={{ menu, setMenu, openMenu, closeMenu }}>
      {children}
    </ContextMenuContext.Provider>
  );
};

export function useContextMenu(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("useContextMenu must be used within ContextMenuProvider");
  }
  return ctx;
}
