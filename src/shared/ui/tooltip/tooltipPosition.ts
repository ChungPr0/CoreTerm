import {
  TOOLTIP_OFFSET_PX,
  TOOLTIP_TOP_ZONE_PX,
  TOOLTIP_VIEWPORT_PAD_PX,
} from "@/shared/defaults";

export type TooltipSide = "top" | "bottom" | "left" | "right";
export type TooltipPlacement = TooltipSide | "auto";
export type TooltipVariant = "default" | "card" | "unstyled";

export interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ComputedTooltipPosition {
  left: number;
  top: number;
  side: TooltipSide;
}

const BIDI_CONTROL_CHARS_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g;

/**
 * Strips invisible Unicode bidirectional override/isolate control characters
 * so untrusted remote filenames or error banners cannot spoof arrow/path direction.
 */
export function sanitizeTooltipText(raw: string): string {
  return raw.replace(BIDI_CONTROL_CHARS_RE, "");
}

/**
 * Computes viewport-clamped fixed coordinates and resolved side for a tooltip
 * anchored to `anchor`. Flips automatically when preferred side lacks space.
 */
export function computeTooltipPosition(
  anchor: RectLike,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  placement: TooltipPlacement = "auto",
  gap = TOOLTIP_OFFSET_PX,
  edgePad = TOOLTIP_VIEWPORT_PAD_PX
): ComputedTooltipPosition {
  const spaceAbove = anchor.top - gap - edgePad;
  const spaceBelow = viewport.height - anchor.bottom - gap - edgePad;
  const spaceLeft = anchor.left - gap - edgePad;
  const spaceRight = viewport.width - anchor.right - gap - edgePad;

  let side: TooltipSide;
  if (placement === "auto") {
    if (anchor.top < TOOLTIP_TOP_ZONE_PX) {
      side = spaceBelow >= tip.height || spaceBelow >= spaceAbove ? "bottom" : "top";
    } else {
      side = spaceAbove >= tip.height || spaceAbove >= spaceBelow ? "top" : "bottom";
    }
  } else if (placement === "bottom") {
    side = spaceBelow < tip.height && spaceAbove > spaceBelow ? "top" : "bottom";
  } else if (placement === "top") {
    side = spaceAbove < tip.height && spaceBelow > spaceAbove ? "bottom" : "top";
  } else if (placement === "left") {
    side = spaceLeft < tip.width && spaceRight > spaceLeft ? "right" : "left";
  } else {
    side = spaceRight < tip.width && spaceLeft > spaceRight ? "left" : "right";
  }

  let rawLeft: number;
  let rawTop: number;

  if (side === "top" || side === "bottom") {
    rawLeft = anchor.left + anchor.width / 2 - tip.width / 2;
    rawTop = side === "bottom" ? anchor.bottom + gap : anchor.top - tip.height - gap;
  } else {
    rawTop = anchor.top + anchor.height / 2 - tip.height / 2;
    rawLeft = side === "right" ? anchor.right + gap : anchor.left - tip.width - gap;
  }

  const maxLeft = Math.max(edgePad, viewport.width - tip.width - edgePad);
  const maxTop = Math.max(edgePad, viewport.height - tip.height - edgePad);

  return {
    left: Math.round(Math.max(edgePad, Math.min(rawLeft, maxLeft))),
    top: Math.round(Math.max(edgePad, Math.min(rawTop, maxTop))),
    side,
  };
}
