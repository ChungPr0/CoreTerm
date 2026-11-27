import React, { useEffect, useRef } from "react";
import { getTabbableElements, trapTabWithin } from "@/shared/utils/focusTrap";

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  positionClassName?: string;
  zIndexClass?: string;
  backdropClassName?: string;
  containerClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

function getVisibleModalPanels(): HTMLElement[] {
  const nodes = document.querySelectorAll<HTMLElement>('[data-modal-panel="true"]');
  const visible: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.closest("[inert]")) continue;
    if (el.getClientRects().length === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    visible.push(el);
  }
  return visible;
}

function isTopmostModalPanel(panel: HTMLElement | null): boolean {
  if (!panel) return false;
  const panels = getVisibleModalPanels();
  return panels.length > 0 && panels[panels.length - 1] === panel;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  closeDisabled = false,
  closeOnBackdrop = false,
  closeOnEscape = true,
  positionClassName = "absolute inset-0",
  zIndexClass = "z-50",
  backdropClassName = "bg-slate-950/80 backdrop-blur-sm",
  containerClassName = "items-center justify-center p-3 sm:p-4",
  panelClassName = "bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden select-none",
  children,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const raf = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || !isTopmostModalPanel(panel)) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && panel.contains(active) && active !== panel) return;
      const tabbables = getTabbableElements(panel);
      if (tabbables.length > 0) {
        tabbables[0].focus();
      } else {
        panel.focus({ preventScroll: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(raf);
      window.requestAnimationFrame(() => {
        const remainingPanels = getVisibleModalPanels();
        if (remainingPanels.length > 0) {
          const topPanel = remainingPanels[remainingPanels.length - 1];
          if (previouslyFocused && topPanel.contains(previouslyFocused)) {
            previouslyFocused.focus();
            return;
          }
          if (!topPanel.contains(document.activeElement)) {
            const tabbables = getTabbableElements(topPanel);
            (tabbables[0] ?? topPanel).focus({ preventScroll: true });
          }
          return;
        }
        if (
          previouslyFocused &&
          previouslyFocused.isConnected &&
          !previouslyFocused.closest("[inert]") &&
          (document.activeElement === document.body || document.activeElement === null)
        ) {
          previouslyFocused.focus({ preventScroll: true });
        }
      });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!isTopmostModalPanel(panel)) return;

      if (e.key === "Tab") {
        trapTabWithin(panel, e);
        return;
      }

      if (e.key === "Escape" && onClose && closeOnEscape && !closeDisabled) {
        if (document.querySelector('[data-popover-menu="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onClose, closeDisabled, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div
      data-modal-root="true"
      onClick={() => {
        if (closeOnBackdrop && !closeDisabled) onClose?.();
      }}
      className={`${positionClassName} ${zIndexClass} ${backdropClassName} flex ${containerClassName}`}
    >
      <div
        ref={panelRef}
        data-modal-panel="true"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
