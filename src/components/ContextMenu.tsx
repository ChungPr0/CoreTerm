import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type ContextMenuEntry =
  | {
      type?: "item";
      id: string;
      label: string;
      icon?: React.ReactNode;
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      highlight?: "admin";
      onSelect: () => void;
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

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    const left = Math.max(
      pad,
      Math.min(x, window.innerWidth - rect.width - pad)
    );
    const top = Math.max(
      pad,
      Math.min(y, window.innerHeight - rect.height - pad)
    );
    setCoords({ left, top });
  }, [x, y, items]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    const onBlur = () => onClose();

    window.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div
      ref={menuRef}
      style={{ left: coords.left, top: coords.top }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-[100] min-w-[228px] py-1.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_14px_40px_rgba(0,0,0,0.72)] text-xs select-none"
    >
      {items.map((item) => {
        if (item.type === "separator") {
          return (
            <div
              key={item.id}
              className="my-1 border-t border-slate-800/90"
            />
          );
        }

        const colorClass = item.disabled
          ? "text-slate-500 cursor-not-allowed"
          : item.danger
          ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300"
          : item.highlight === "admin"
          ? "text-amber-300 hover:bg-amber-500/15 hover:text-amber-200"
          : "text-slate-200 hover:bg-sky-500/15 hover:text-white";

        return (
          <button
            key={item.id}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
            className={`w-full px-3 py-1.5 flex items-center justify-between gap-4 text-left transition-colors ${colorClass}`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                {item.icon}
              </span>
              <span className="truncate font-medium">{item.label}</span>
            </span>
            {item.shortcut && (
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
