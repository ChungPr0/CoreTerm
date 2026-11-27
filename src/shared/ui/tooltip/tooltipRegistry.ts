import React, { createContext } from "react";
import type { TooltipPlacement, TooltipVariant } from "./tooltipPosition";

export interface TooltipSlotEntry {
  content: React.ReactNode;
  placement: TooltipPlacement;
  variant: TooltipVariant;
  disabled: boolean;
}

export type SlotChangeListener = (id: string) => void;

export interface TooltipRegistry {
  getSlot: (id: string) => TooltipSlotEntry | undefined;
  upsertSlot: (id: string, entry: TooltipSlotEntry) => void;
  removeSlot: (id: string) => void;
  subscribe: (listener: SlotChangeListener) => () => void;
}

export function createTooltipRegistry(): TooltipRegistry {
  const slots = new Map<string, TooltipSlotEntry>();
  const listeners = new Set<SlotChangeListener>();

  const notify = (id: string) => {
    listeners.forEach((fn) => fn(id));
  };

  return {
    getSlot: (id) => slots.get(id),
    upsertSlot: (id, entry) => {
      const prev = slots.get(id);
      if (
        prev &&
        prev.content === entry.content &&
        prev.placement === entry.placement &&
        prev.variant === entry.variant &&
        prev.disabled === entry.disabled
      ) {
        return;
      }
      slots.set(id, entry);
      notify(id);
    },
    removeSlot: (id) => {
      if (!slots.delete(id)) return;
      notify(id);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const TooltipRegistryContext = createContext<TooltipRegistry | null>(null);

export function parsePlacementAttr(raw: string | null): TooltipPlacement {
  if (raw === "top" || raw === "bottom" || raw === "left" || raw === "right" || raw === "auto") {
    return raw;
  }
  return "auto";
}

export function isElementDisabled(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled === true) return true;
  if (el.getAttribute("aria-disabled") === "true") return true;
  return false;
}

function getTopmostVisibleModalPanel(doc: Document): HTMLElement | null {
  const panels = doc.querySelectorAll<HTMLElement>('[data-modal-panel="true"]');
  let topPanel: HTMLElement | null = null;
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    if (panel.closest("[inert]")) continue;
    if (panel.getClientRects().length === 0) continue;
    const style = window.getComputedStyle(panel);
    if (style.display === "none" || style.visibility === "hidden") continue;
    topPanel = panel;
  }
  return topPanel;
}

/**
 * Enforces trust and UI-isolation boundaries on tooltip anchors:
 * rejects detached/disabled nodes, `[inert]` subtrees, and background anchors
 * outside the active modal panel (except top-level window caption controls).
 */
export function isTooltipAnchorAllowed(el: HTMLElement): boolean {
  if (!el.isConnected || isElementDisabled(el)) return false;
  if (el.closest("[inert]")) return false;

  const doc = el.ownerDocument;
  if (doc) {
    const topModal = getTopmostVisibleModalPanel(doc);
    if (topModal && !topModal.contains(el) && !el.closest('[data-window-caption="true"]')) {
      return false;
    }
  }
  return true;
}
