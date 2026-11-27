import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  TOOLTIP_OFFSCREEN_COORD,
  TOOLTIP_RESHOW_DELAY_MS,
  TOOLTIP_SHOW_DELAY_MS,
  TOOLTIP_WARMUP_WINDOW_MS,
} from "@/shared/defaults";
import {
  computeTooltipPosition,
  sanitizeTooltipText,
  type ComputedTooltipPosition,
  type TooltipPlacement,
  type TooltipVariant,
} from "./tooltipPosition";
import {
  isTooltipAnchorAllowed,
  parsePlacementAttr,
  type TooltipRegistry,
} from "./tooltipRegistry";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ActiveTooltipState {
  anchorEl: HTMLElement;
  slotId: string | null;
  text: string | null;
  placement: TooltipPlacement;
  variant: TooltipVariant;
  warm: boolean;
}

function matchesFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return false;
  }
}

/**
 * Isolated leaf overlay that owns all hover/position state so tooltip activity
 * never re-renders `TooltipProvider` or the application component tree.
 */
export const TooltipLayer: React.FC<{ registry: TooltipRegistry }> = ({ registry }) => {
  const [active, setActive] = useState<ActiveTooltipState | null>(null);
  const [, setSlotTick] = useState(0);
  const activeRef = useRef<ActiveTooltipState | null>(null);
  activeRef.current = active;

  const pendingAnchorRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const lastVisibleAtRef = useRef<number>(0);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<ComputedTooltipPosition | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(
    (preserveWarmup: boolean) => {
      clearShowTimer();
      pendingAnchorRef.current = null;
      if (activeRef.current) {
        lastVisibleAtRef.current = preserveWarmup ? performance.now() : 0;
        activeRef.current = null;
        setActive(null);
        setPos(null);
      } else if (!preserveWarmup) {
        lastVisibleAtRef.current = 0;
      }
    },
    [clearShowTimer]
  );

  const resolveAnchorPayload = useCallback(
    (el: HTMLElement): Omit<ActiveTooltipState, "warm"> | null => {
      if (!isTooltipAnchorAllowed(el)) return null;

      const slotId = el.getAttribute("data-tooltip-id");
      if (slotId) {
        const slot = registry.getSlot(slotId);
        if (!slot || slot.disabled || slot.content == null || slot.content === "") {
          return null;
        }
        return {
          anchorEl: el,
          slotId,
          text: null,
          placement: slot.placement,
          variant: slot.variant,
        };
      }

      const rawText = el.getAttribute("data-tooltip");
      if (!rawText) return null;
      const cleanText = sanitizeTooltipText(rawText);
      if (!cleanText.trim()) return null;

      return {
        anchorEl: el,
        slotId: null,
        text: cleanText,
        placement: parsePlacementAttr(el.getAttribute("data-tooltip-placement")),
        variant: "default",
      };
    },
    [registry]
  );

  useEffect(() => {
    return registry.subscribe((changedId) => {
      if (activeRef.current?.slotId !== changedId) return;
      const slot = registry.getSlot(changedId);
      if (!slot || slot.disabled || slot.content == null || slot.content === "") {
        hideTooltip(false);
      } else {
        setSlotTick((n) => n + 1);
      }
    });
  }, [registry, hideTooltip]);

  useEffect(() => {
    const activateForTarget = (rawTarget: EventTarget | null, viaKeyboard = false) => {
      if (!(rawTarget instanceof Element)) {
        hideTooltip(true);
        return;
      }

      const candidate = rawTarget.closest<HTMLElement>("[data-tooltip-id], [data-tooltip]");
      if (!candidate) {
        hideTooltip(true);
        return;
      }

      if (activeRef.current?.anchorEl === candidate || pendingAnchorRef.current === candidate) {
        return;
      }

      const payload = resolveAnchorPayload(candidate);
      if (!payload) {
        hideTooltip(true);
        return;
      }

      clearShowTimer();
      pendingAnchorRef.current = candidate;

      const now = performance.now();
      const isWarm =
        viaKeyboard ||
        activeRef.current !== null ||
        (lastVisibleAtRef.current > 0 && now - lastVisibleAtRef.current <= TOOLTIP_WARMUP_WINDOW_MS);

      const delayMs = isWarm ? TOOLTIP_RESHOW_DELAY_MS : TOOLTIP_SHOW_DELAY_MS;
      if (activeRef.current && activeRef.current.anchorEl !== candidate) {
        hideTooltip(true);
        pendingAnchorRef.current = candidate;
      }

      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        if (pendingAnchorRef.current !== candidate) return;
        pendingAnchorRef.current = null;
        const fresh = resolveAnchorPayload(candidate);
        if (!fresh) return;
        setActive({ ...fresh, warm: isWarm });
      }, delayMs);
    };

    const onPointerOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (e.buttons !== 0) {
        hideTooltip(false);
        return;
      }
      activateForTarget(e.target, false);
    };

    const onPointerOut = (e: PointerEvent) => {
      const currentAnchor = activeRef.current?.anchorEl ?? pendingAnchorRef.current;
      if (!currentAnchor) return;
      const related = e.relatedTarget;
      if (related instanceof Node && currentAnchor.contains(related)) {
        return;
      }
      if (related instanceof Element) {
        const nextCandidate = related.closest<HTMLElement>("[data-tooltip-id], [data-tooltip]");
        if (nextCandidate === currentAnchor) return;
      }
      hideTooltip(true);
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target;
      const currentAnchor = activeRef.current?.anchorEl;
      if (currentAnchor && (!(target instanceof Node) || !currentAnchor.contains(target))) {
        hideTooltip(false);
      }
      if (!(target instanceof HTMLElement)) return;
      if (!matchesFocusVisible(target)) return;
      activateForTarget(target, true);
    };

    const onFocusOut = () => {
      hideTooltip(true);
    };

    const onHardDismiss = () => {
      hideTooltip(false);
    };

    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerout", onPointerOut, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("focusout", onFocusOut, true);
    window.addEventListener("pointerdown", onHardDismiss, true);
    window.addEventListener("wheel", onHardDismiss, { capture: true, passive: true });
    window.addEventListener("scroll", onHardDismiss, true);
    window.addEventListener("keydown", onHardDismiss, true);
    window.addEventListener("contextmenu", onHardDismiss, true);
    window.addEventListener("blur", onHardDismiss);

    return () => {
      clearShowTimer();
      document.removeEventListener("pointerover", onPointerOver, true);
      document.removeEventListener("pointerout", onPointerOut, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      window.removeEventListener("pointerdown", onHardDismiss, true);
      window.removeEventListener("wheel", onHardDismiss, true);
      window.removeEventListener("scroll", onHardDismiss, true);
      window.removeEventListener("keydown", onHardDismiss, true);
      window.removeEventListener("contextmenu", onHardDismiss, true);
      window.removeEventListener("blur", onHardDismiss);
    };
  }, [clearShowTimer, hideTooltip, resolveAnchorPayload]);

  useEffect(() => {
    if (!active) return;
    const anchor = active.anchorEl;
    if (!isTooltipAnchorAllowed(anchor)) {
      hideTooltip(false);
      return;
    }

    const mo = new MutationObserver(() => {
      if (!isTooltipAnchorAllowed(anchor)) {
        hideTooltip(false);
        return;
      }
      if (!active.slotId) {
        const rawText = anchor.getAttribute("data-tooltip");
        const cleanText = rawText ? sanitizeTooltipText(rawText) : "";
        if (!cleanText.trim()) {
          hideTooltip(false);
        } else if (cleanText !== active.text) {
          setActive((prev) =>
            prev && prev.anchorEl === anchor ? { ...prev, text: cleanText } : prev
          );
        }
      }
    });

    mo.observe(anchor, {
      attributes: true,
      attributeFilter: ["data-tooltip", "disabled", "aria-disabled"],
    });
    if (anchor.parentElement) {
      mo.observe(anchor.parentElement, { childList: true });
    }
    if (anchor.ownerDocument?.body) {
      mo.observe(anchor.ownerDocument.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["inert"],
      });
    }
    return () => mo.disconnect();
  }, [active, hideTooltip]);

  const slotEntry = active?.slotId ? registry.getSlot(active.slotId) : undefined;
  const renderedContent = active
    ? active.slotId
      ? slotEntry?.content ?? null
      : active.text
    : null;
  const effectiveVariant: TooltipVariant = active
    ? active.slotId && slotEntry
      ? slotEntry.variant
      : active.variant
    : "default";
  const effectivePlacement: TooltipPlacement = active
    ? active.slotId && slotEntry
      ? slotEntry.placement
      : active.placement
    : "auto";

  useIsomorphicLayoutEffect(() => {
    if (!active || renderedContent == null || renderedContent === "") {
      setPos((prev) => (prev === null ? prev : null));
      return;
    }
    const anchor = active.anchorEl;
    const tipEl = tipRef.current;
    if (!isTooltipAnchorAllowed(anchor) || !tipEl) {
      setPos((prev) => (prev === null ? prev : null));
      return;
    }

    const update = () => {
      if (!isTooltipAnchorAllowed(anchor) || !tipRef.current) {
        hideTooltip(false);
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      if (anchorRect.width === 0 && anchorRect.height === 0) {
        hideTooltip(false);
        return;
      }
      const tipRect = tipRef.current.getBoundingClientRect();
      const nextPos = computeTooltipPosition(
        anchorRect,
        { width: tipRect.width, height: tipRect.height },
        { width: window.innerWidth, height: window.innerHeight },
        effectivePlacement
      );
      setPos((prev) =>
        prev &&
        prev.left === nextPos.left &&
        prev.top === nextPos.top &&
        prev.side === nextPos.side
          ? prev
          : nextPos
      );
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active, renderedContent, effectivePlacement, hideTooltip]);

  if (
    !active ||
    renderedContent == null ||
    renderedContent === "" ||
    typeof document === "undefined"
  ) {
    return null;
  }

  const variantClasses =
    effectiveVariant === "unstyled"
      ? ""
      : effectiveVariant === "card"
        ? "rounded-xl border border-slate-700/85 bg-[#0d131f]/95 p-2.5 text-xs text-slate-100 shadow-[0_14px_36px_rgba(0,0,0,0.75)] backdrop-blur-md"
        : "w-max max-w-[340px] max-h-[200px] overflow-hidden break-words rounded-lg border border-slate-700/85 bg-slate-900/95 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-slate-100 shadow-[0_10px_28px_rgba(0,0,0,0.68)] backdrop-blur-md";

  const animClass = pos
    ? active.warm
      ? "opacity-100"
      : pos.side === "bottom"
        ? "animate-tooltip-in-bottom"
        : pos.side === "top"
          ? "animate-tooltip-in-top"
          : "animate-tooltip-in-fade"
    : "opacity-0";

  return createPortal(
    <div
      ref={tipRef}
      role="tooltip"
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : {
              left: TOOLTIP_OFFSCREEN_COORD,
              top: TOOLTIP_OFFSCREEN_COORD,
              visibility: "hidden",
            }
      }
      className={`pointer-events-none fixed z-[120] select-none ${variantClasses} ${animClass}`}
    >
      {renderedContent}
    </div>,
    document.body
  );
};
