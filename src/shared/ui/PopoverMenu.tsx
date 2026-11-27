import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PopoverMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  portal?: boolean;
  matchAnchorWidth?: boolean;
  maxHeightPx?: number;
  style?: React.CSSProperties;
  className?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export const PopoverMenu: React.FC<PopoverMenuProps> = ({
  isOpen,
  onClose,
  anchorRef,
  portal = false,
  matchAnchorWidth = false,
  maxHeightPx,
  style,
  className = "",
  onContextMenu,
  children,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!isOpen || !portal || !anchorRef) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        onClose();
        return;
      }
      const gap = 4;
      const pad = 8;
      const desiredMaxH = maxHeightPx ?? 224;
      const rawMenuH = menuRef.current?.scrollHeight ?? desiredMaxH;
      const estH = Math.min(rawMenuH || desiredMaxH, desiredMaxH);
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const openUp = spaceBelow < estH && spaceAbove > spaceBelow;

      const left = Math.max(
        pad,
        Math.min(rect.left, window.innerWidth - rect.width - pad)
      );

      setPortalStyle({
        position: "fixed",
        left,
        width: matchAnchorWidth ? rect.width : undefined,
        minWidth: rect.width,
        ...(openUp
          ? {
              bottom: window.innerHeight - rect.top + gap,
              maxHeight: Math.max(96, Math.min(desiredMaxH, spaceAbove)),
            }
          : {
              top: rect.bottom + gap,
              maxHeight: Math.max(96, Math.min(desiredMaxH, spaceBelow)),
            }),
      });
    };

    updatePosition();

    const onScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, portal, anchorRef, matchAnchorWidth, maxHeightPx, onClose]);

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

  const content = (
    <div
      ref={menuRef}
      data-popover-menu="true"
      style={portal ? { ...portalStyle, ...style } : style}
      onContextMenu={onContextMenu}
      className={className}
    >
      {children}
    </div>
  );

  if (portal && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
};
