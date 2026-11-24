import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

export type ContextMenuEntry =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      badge?: { text: string; active?: boolean };
      disabled?: boolean;
      danger?: boolean;
      highlight?: "admin";
      children?: ContextMenuEntry[];
      onSelect?: () => void;
    }
  | {
      type: "separator";
      id: string;
    };

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

const MENU_PANEL_CLASS =
  "fixed z-[100] min-w-[228px] p-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.72)] text-xs select-none";

function clampPosition(
  rawX: number,
  rawY: number,
  width: number,
  height: number
): { left: number; top: number } {
  const pad = 8;
  return {
    left: Math.max(pad, Math.min(rawX, window.innerWidth - width - pad)),
    top: Math.max(pad, Math.min(rawY, window.innerHeight - height - pad)),
  };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const subMenuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });
  const [activeSub, setActiveSub] = useState<{
    id: string;
    anchorRect: DOMRect;
    items: ContextMenuEntry[];
  } | null>(null);
  const [subCoords, setSubCoords] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords(clampPosition(x, y, rect.width, rect.height));
    setActiveSub(null);
  }, [x, y, items]);

  useLayoutEffect(() => {
    const el = subMenuRef.current;
    if (!el || !activeSub) return;
    const rect = el.getBoundingClientRect();
    const { anchorRect } = activeSub;
    const pad = 8;
    const fitsRight = anchorRect.right + rect.width + pad <= window.innerWidth;
    const rawLeft = fitsRight ? anchorRect.right - 2 : anchorRect.left - rect.width + 2;
    setSubCoords(clampPosition(rawLeft, anchorRect.top - 6, rect.width, rect.height));
  }, [activeSub]);

  useEffect(() => {
    const armClickSwallow = () => {
      const swallowClick = (ev: MouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      const disarm = () => {
        window.setTimeout(() => {
          window.removeEventListener("click", swallowClick, true);
        }, 50);
      };
      window.addEventListener("click", swallowClick, true);
      window.addEventListener("pointerup", disarm, { capture: true, once: true });
      window.addEventListener("pointercancel", disarm, { capture: true, once: true });
      window.addEventListener("blur", disarm, { once: true });
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inMain = menuRef.current?.contains(target);
      const inSub = subMenuRef.current?.contains(target);
      if (!inMain && !inSub) {
        if (e.button === 0) {
          e.preventDefault();
          e.stopPropagation();
          armClickSwallow();
        }
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onBlur = () => onClose();

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  const renderEntry = (entry: ContextMenuEntry, isRoot: boolean) => {
    if (entry.type === "separator") {
      return (
        <div
          key={entry.id}
          className="my-1 border-t border-slate-800/90"
        />
      );
    }

    const hasChildren = Boolean(entry.children && entry.children.length > 0);
    const isSubOpen = isRoot && activeSub?.id === entry.id;
    const colorClass = entry.disabled
      ? "text-slate-500 cursor-not-allowed"
      : entry.danger
      ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
      : entry.highlight === "admin"
      ? "text-amber-300 hover:bg-amber-500/15 hover:text-amber-200"
      : isSubOpen
      ? "bg-sky-500/15 text-white"
      : "text-slate-200 hover:bg-sky-500/15 hover:text-white";

    return (
      <button
        key={entry.id}
        type="button"
        disabled={entry.disabled}
        onMouseEnter={(e) => {
          if (!isRoot) return;
          if (hasChildren && !entry.disabled) {
            setActiveSub({
              id: entry.id,
              anchorRect: e.currentTarget.getBoundingClientRect(),
              items: entry.children!,
            });
          } else {
            setActiveSub(null);
          }
        }}
        onClick={(e) => {
          if (entry.disabled) return;
          if (hasChildren) {
            if (isRoot) {
              setActiveSub({
                id: entry.id,
                anchorRect: e.currentTarget.getBoundingClientRect(),
                items: entry.children!,
              });
            }
            return;
          }
          onClose();
          entry.onSelect?.();
        }}
        className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-4 text-left transition-colors ${colorClass}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
            {entry.icon}
          </span>
          <span className="truncate font-medium">{entry.label}</span>
        </span>
        {(entry.badge || entry.shortcut || hasChildren) && (
          <span className="flex items-center gap-1.5 shrink-0">
            {entry.badge && (
              <span
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide leading-none border ${
                  entry.badge.active
                    ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-300"
                    : "bg-slate-800/80 border-slate-700/80 text-slate-400"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    entry.badge.active ? "bg-emerald-400" : "bg-slate-500"
                  }`}
                />
                {entry.badge.text}
              </span>
            )}
            {entry.shortcut && (
              <span className="text-[10px] font-mono text-slate-500">
                {entry.shortcut}
              </span>
            )}
            {hasChildren && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <div
        ref={menuRef}
        style={{ left: coords.left, top: coords.top }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className={MENU_PANEL_CLASS}
      >
        {items.map((item) => renderEntry(item, true))}
      </div>

      {activeSub && (
        <div
          ref={subMenuRef}
          style={{ left: subCoords.left, top: subCoords.top }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className={`${MENU_PANEL_CLASS} z-[101] max-h-72 overflow-y-auto pr-[1px]`}
        >
          {activeSub.items.map((item) => renderEntry(item, false))}
        </div>
      )}
    </>
  );
};
