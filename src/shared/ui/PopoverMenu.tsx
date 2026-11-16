import React, { useEffect, useRef } from "react";

interface PopoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export const PopoverMenu: React.FC<PopoverMenuProps> = ({
  isOpen,
  onClose,
  anchorRef,
  style,
  className = "",
  onContextMenu,
  children,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (e.button !== 2 && anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      style={style}
      onContextMenu={onContextMenu}
      className={className}
    >
      {children}
    </div>
  );
};
