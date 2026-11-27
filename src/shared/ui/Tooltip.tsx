import React, {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { TooltipLayer } from "./tooltip/TooltipLayer";
import {
  computeTooltipPosition,
  sanitizeTooltipText,
  type ComputedTooltipPosition,
  type RectLike,
  type TooltipPlacement,
  type TooltipSide,
  type TooltipVariant,
} from "./tooltip/tooltipPosition";
import {
  TooltipRegistryContext,
  createTooltipRegistry,
  isTooltipAnchorAllowed,
  type TooltipRegistry,
  type TooltipSlotEntry,
} from "./tooltip/tooltipRegistry";

export {
  computeTooltipPosition,
  createTooltipRegistry,
  isTooltipAnchorAllowed,
  sanitizeTooltipText,
  type ComputedTooltipPosition,
  type RectLike,
  type TooltipPlacement,
  type TooltipRegistry,
  type TooltipSide,
  type TooltipSlotEntry,
  type TooltipVariant,
};

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export const TooltipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const registryRef = useRef<TooltipRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = createTooltipRegistry();
  }

  return (
    <TooltipRegistryContext.Provider value={registryRef.current}>
      {children}
      <TooltipLayer registry={registryRef.current} />
    </TooltipRegistryContext.Provider>
  );
};

export interface UseTooltipSlotOptions {
  placement?: TooltipPlacement;
  variant?: TooltipVariant;
  disabled?: boolean;
}

/**
 * Registers rich ReactNode tooltip content with `TooltipProvider` and returns
 * data-attributes to spread directly onto the anchor element without wrapper nodes.
 */
export function useTooltipSlot(
  content: React.ReactNode | undefined | null,
  options?: UseTooltipSlotOptions
): { "data-tooltip-id"?: string } {
  const registry = useContext(TooltipRegistryContext);
  const rawId = useId();
  const slotId = `ct-tip-${rawId}`;
  const placement = options?.placement ?? "auto";
  const variant = options?.variant ?? "default";
  const disabled = Boolean(options?.disabled) || content == null || content === "";

  useIsomorphicLayoutEffect(() => {
    if (!registry) return;
    if (disabled) {
      registry.removeSlot(slotId);
      return;
    }
    registry.upsertSlot(slotId, {
      content,
      placement,
      variant,
      disabled: false,
    });
  }, [registry, slotId, content, placement, variant, disabled]);

  useEffect(() => {
    if (!registry) return;
    return () => registry.removeSlot(slotId);
  }, [registry, slotId]);

  if (!registry || disabled) {
    return {};
  }

  return { "data-tooltip-id": slotId };
}

export interface TooltipProps extends UseTooltipSlotOptions {
  content: React.ReactNode;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  placement,
  variant,
  disabled,
  children,
}) => {
  const slotProps = useTooltipSlot(content, { placement, variant, disabled });
  if (!slotProps["data-tooltip-id"]) {
    return children;
  }
  return React.cloneElement(children, slotProps as Partial<unknown>);
};

Tooltip.displayName = "Tooltip";
