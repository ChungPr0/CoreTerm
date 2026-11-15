import { useCallback, useEffect, useRef } from "react";
import type React from "react";

export interface PointerDragBase {
  pointerId: number;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  isDragging: boolean;
}

interface UsePointerDragOpts<T extends PointerDragBase> {
  enabled?: boolean;
  thresholdPx?: number;
  cancelOnEscape?: boolean;
  suppressClickMs?: number;
  scrollElRef?: React.RefObject<HTMLElement | null>;
  scrollEdgePx?: number;
  onActivate?: (state: T) => void;
  onMove: (state: T, event: PointerEvent) => void;
  onAutoScrollTick?: (state: T) => boolean;
  onEnd: (state: T | null, commit: boolean) => void;
}

/** Shared window-level pointer tracking with threshold, blur/Esc cancellation, and optional edge auto-scroll. */
export function usePointerDrag<T extends PointerDragBase>(opts: UsePointerDragOpts<T>) {
  const enabled = opts.enabled ?? true;
  const thresholdPx = opts.thresholdPx ?? 6;
  const cancelOnEscape = opts.cancelOnEscape ?? false;
  const suppressClickMs = opts.suppressClickMs ?? 80;
  const scrollEdgePx = opts.scrollEdgePx ?? 36;

  const dragRef = useRef<T | null>(null);
  const suppressRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!enabled) {
      dragRef.current = null;
      document.body.style.cursor = "";
      optsRef.current.onEnd(null, false);
    }
  }, [enabled]);

  useEffect(() => {
    let rafId: number | null = null;

    const autoScrollStep = () => {
      const drag = dragRef.current;
      const scroller = optsRef.current.scrollElRef?.current;
      if (!drag || !drag.isDragging || !scroller) {
        rafId = null;
        return;
      }

      const rect = scroller.getBoundingClientRect();
      let delta = 0;
      if (drag.clientY < rect.top + scrollEdgePx) {
        delta = -Math.max(3, Math.round((rect.top + scrollEdgePx - drag.clientY) / 4));
      } else if (drag.clientY > rect.bottom - scrollEdgePx) {
        delta = Math.max(3, Math.round((drag.clientY - (rect.bottom - scrollEdgePx)) / 4));
      }

      if (delta !== 0) {
        scroller.scrollTop += delta;
        optsRef.current.onAutoScrollTick?.(drag);
        rafId = window.requestAnimationFrame(autoScrollStep);
      } else {
        rafId = null;
      }
    };

    const finishDrag = (commit: boolean) => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      document.body.style.cursor = "";
      const drag = dragRef.current;
      dragRef.current = null;

      if (drag?.isDragging) {
        suppressRef.current = true;
        window.setTimeout(() => {
          suppressRef.current = false;
        }, suppressClickMs);
      }

      optsRef.current.onEnd(drag, commit);
    };

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (!drag.isDragging) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < thresholdPx) {
          return;
        }
        drag.isDragging = true;
        document.body.style.cursor = "grabbing";
        optsRef.current.onActivate?.(drag);
      }

      drag.clientX = e.clientX;
      drag.clientY = e.clientY;
      optsRef.current.onMove(drag, e);

      const scroller = optsRef.current.scrollElRef?.current;
      if (rafId === null && scroller && scroller.scrollHeight > scroller.clientHeight) {
        const rect = scroller.getBoundingClientRect();
        if (e.clientY < rect.top + scrollEdgePx || e.clientY > rect.bottom - scrollEdgePx) {
          rafId = window.requestAnimationFrame(autoScrollStep);
        }
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finishDrag(true);
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (dragRef.current && e.pointerId === dragRef.current.pointerId) finishDrag(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (cancelOnEscape && e.key === "Escape" && dragRef.current?.isDragging) {
        e.preventDefault();
        e.stopPropagation();
        finishDrag(false);
      }
    };

    const onBlur = () => finishDrag(false);

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    window.addEventListener("blur", onBlur);
    if (cancelOnEscape) window.addEventListener("keydown", onKeyDown, true);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      window.removeEventListener("blur", onBlur);
      if (cancelOnEscape) window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [cancelOnEscape, scrollEdgePx, suppressClickMs, thresholdPx]);

  const beginDrag = useCallback(
    (state: Omit<T, "clientX" | "clientY" | "isDragging">) => {
      if (!enabled) return;
      dragRef.current = {
        ...state,
        clientX: state.startX,
        clientY: state.startY,
        isDragging: false,
      } as T;
    },
    [enabled]
  );

  return { dragRef, suppressRef, beginDrag };
}
