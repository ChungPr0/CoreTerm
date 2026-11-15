import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TerminalTabItem } from "../types";

interface ActiveTabDrag {
  tabId: string;
  pointerId: number;
  captureEl: HTMLDivElement;
  startX: number;
  lastClientX: number;
  grabOffset: number;
  desiredLeft: number;
  appliedTranslate: number;
  isDragging: boolean;
  pendingSwap: boolean;
}

interface UseTabDragOpts {
  tabs: TerminalTabItem[];
  onSelectTab: (tabId: string) => void;
  onReorderTab: (tabId: string, toIndex: number) => void;
}

export function useTabDrag({
  tabs,
  onSelectTab,
  onReorderTab,
}: UseTabDragOpts) {
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const tabElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef = useRef<ActiveTabDrag | null>(null);
  const suppressClickRef = useRef(false);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const onSelectTabRef = useRef(onSelectTab);
  onSelectTabRef.current = onSelectTab;
  const onReorderTabRef = useRef(onReorderTab);
  onReorderTabRef.current = onReorderTab;

  // Keep dragged tab glued under the cursor immediately after React commits a slot swap.
  useLayoutEffect(() => {
    const drag = dragRef.current;
    if (!drag || !drag.isDragging) return;
    drag.pendingSwap = false;
    const el = tabElsRef.current.get(drag.tabId);
    if (!el) return;
    el.style.transform = "";
    const layoutLeft = el.getBoundingClientRect().left;
    const dx = drag.desiredLeft - layoutLeft;
    drag.appliedTranslate = dx;
    el.style.transform = `translate3d(${dx}px, 0, 0)`;
  }, [tabs, draggingTabId]);

  useEffect(() => {
    let rafId: number | null = null;

    const syncDraggedPosition = (clientX: number) => {
      const drag = dragRef.current;
      const strip = stripRef.current;
      if (!drag || !strip) return;
      const el = tabElsRef.current.get(drag.tabId);
      if (!el) return;

      const stripRect = strip.getBoundingClientRect();
      const tabRect = el.getBoundingClientRect();
      const layoutLeft = tabRect.left - drag.appliedTranslate;
      const maxLeft = Math.max(stripRect.left, stripRect.right - tabRect.width);
      const desiredLeft = Math.max(
        stripRect.left,
        Math.min(maxLeft, clientX - drag.grabOffset)
      );
      drag.desiredLeft = desiredLeft;

      const dx = desiredLeft - layoutLeft;
      drag.appliedTranslate = dx;
      el.style.transform = `translate3d(${dx}px, 0, 0)`;

      // Determine slot crossing by midpoint with slight hysteresis to prevent ping-ponging.
      if (!drag.pendingSwap) {
        const list = tabsRef.current;
        const fromIndex = list.findIndex((item) => item.tabId === drag.tabId);
        if (fromIndex !== -1) {
          const dragCenter = desiredLeft + tabRect.width / 2;
          let targetIndex = fromIndex;

          for (let i = fromIndex - 1; i >= 0; i--) {
            const neighborEl = tabElsRef.current.get(list[i].tabId);
            if (!neighborEl) continue;
            const nRect = neighborEl.getBoundingClientRect();
            if (dragCenter < nRect.left + nRect.width * 0.62) {
              targetIndex = i;
            } else {
              break;
            }
          }

          if (targetIndex === fromIndex) {
            for (let i = fromIndex + 1; i < list.length; i++) {
              const neighborEl = tabElsRef.current.get(list[i].tabId);
              if (!neighborEl) continue;
              const nRect = neighborEl.getBoundingClientRect();
              if (dragCenter > nRect.left + nRect.width * 0.38) {
                targetIndex = i;
              } else {
                break;
              }
            }
          }

          if (targetIndex !== fromIndex) {
            drag.pendingSwap = true;
            onReorderTabRef.current(drag.tabId, targetIndex);
          }
        }
      }
    };

    const autoScrollEdge = () => {
      rafId = null;
      const drag = dragRef.current;
      const strip = stripRef.current;
      if (!drag || !drag.isDragging || !strip) return;
      if (strip.scrollWidth > strip.clientWidth) {
        const sRect = strip.getBoundingClientRect();
        const edge = 26;
        let delta = 0;
        if (drag.lastClientX < sRect.left + edge) {
          delta = -Math.max(4, Math.round((sRect.left + edge - drag.lastClientX) * 0.45));
        } else if (drag.lastClientX > sRect.right - edge) {
          delta = Math.max(4, Math.round((drag.lastClientX - (sRect.right - edge)) * 0.45));
        }
        if (delta !== 0) {
          strip.scrollLeft += delta;
          syncDraggedPosition(drag.lastClientX);
          rafId = window.requestAnimationFrame(autoScrollEdge);
        }
      }
    };

    const stopDrag = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = "";
      const drag = dragRef.current;
      if (!drag) return;
      try {
        if (drag.captureEl.hasPointerCapture(drag.pointerId)) {
          drag.captureEl.releasePointerCapture(drag.pointerId);
        }
      } catch {
        // Ignore if element unmounted or capture already released
      }
      const el = tabElsRef.current.get(drag.tabId);
      if (el) el.style.transform = "";
      if (drag.isDragging) {
        suppressClickRef.current = true;
        onSelectTabRef.current(drag.tabId);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 50);
      }
      dragRef.current = null;
      setDraggingTabId(null);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const el = tabElsRef.current.get(drag.tabId);
      const strip = stripRef.current;
      if (!el || !strip) {
        stopDrag();
        return;
      }

      if (!drag.isDragging) {
        if (Math.abs(e.clientX - drag.startX) < 4) return;
        drag.isDragging = true;
        document.body.style.cursor = "grabbing";
        setDraggingTabId(drag.tabId);
        onSelectTabRef.current(drag.tabId);
      }

      drag.lastClientX = e.clientX;
      syncDraggedPosition(e.clientX);

      if (rafId === null && strip.scrollWidth > strip.clientWidth) {
        const sRect = strip.getBoundingClientRect();
        if (e.clientX < sRect.left + 26 || e.clientX > sRect.right - 26) {
          rafId = window.requestAnimationFrame(autoScrollEdge);
        }
      }
    };

    const onPointerEnd = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && e.pointerId === drag.pointerId) stopDrag();
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    window.addEventListener("blur", stopDrag);
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      window.removeEventListener("blur", stopDrag);
    };
  }, []);

  const handleTabPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    tabId: string
  ) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();

    const captureEl = e.currentTarget;
    try {
      captureEl.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if synthetic event lacks pointer capture support
    }

    const rect = captureEl.getBoundingClientRect();
    dragRef.current = {
      tabId,
      pointerId: e.pointerId,
      captureEl,
      startX: e.clientX,
      lastClientX: e.clientX,
      grabOffset: e.clientX - rect.left,
      desiredLeft: rect.left,
      appliedTranslate: 0,
      isDragging: false,
      pendingSwap: false,
    };
  };

  const handleStripWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const strip = stripRef.current;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      strip.scrollLeft += e.deltaY;
    }
  };

  return {
    draggingTabId,
    stripRef,
    tabElsRef,
    suppressClickRef,
    handleTabPointerDown,
    handleStripWheel,
  };
}
