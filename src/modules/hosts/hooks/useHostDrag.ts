import React, { useState } from "react";
import { usePointerDrag, type PointerDragBase } from "@/shared/hooks/usePointerDrag";
import type { HostProfileSummaryDto } from "../types";

export interface HostDragPreview {
  host: HostProfileSummaryDto;
  sourceGroup: string;
  clientX: number;
  clientY: number;
  overGroup: string | null;
}

interface ActiveHostDrag extends PointerDragBase {
  host: HostProfileSummaryDto;
  sourceGroup: string;
  overGroup: string | null;
}

interface UseHostDragOpts {
  isOpen: boolean;
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  groupElsRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onDropGroup: (hostId: string, targetGroup: string) => void;
}

export function useHostDrag({
  isOpen,
  listScrollRef,
  groupElsRef,
  onDropGroup,
}: UseHostDragOpts) {
  const [dragPreview, setDragPreview] = useState<HostDragPreview | null>(null);

  const findGroupAtPoint = (clientX: number, clientY: number): string | null => {
    for (const [groupName, el] of groupElsRef.current.entries()) {
      const rect = el.getBoundingClientRect();
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return groupName;
      }
    }
    return null;
  };

  const toPreview = (drag: ActiveHostDrag): HostDragPreview => ({
    host: drag.host,
    sourceGroup: drag.sourceGroup,
    clientX: drag.clientX,
    clientY: drag.clientY,
    overGroup: drag.overGroup,
  });

  const { suppressRef: suppressDblClickRef, beginDrag } = usePointerDrag<ActiveHostDrag>({
    enabled: isOpen,
    suppressClickMs: 120,
    scrollElRef: listScrollRef,
    onMove: (drag, e) => {
      drag.overGroup = findGroupAtPoint(e.clientX, e.clientY);
      setDragPreview(toPreview(drag));
    },
    onAutoScrollTick: (drag) => {
      const hovered = findGroupAtPoint(drag.clientX, drag.clientY);
      if (hovered !== drag.overGroup) {
        drag.overGroup = hovered;
        setDragPreview(toPreview(drag));
      }
      return true;
    },
    onEnd: (drag, commit) => {
      setDragPreview(null);
      if (
        commit &&
        drag?.isDragging &&
        drag.overGroup &&
        drag.overGroup.toLowerCase() !== drag.sourceGroup.toLowerCase()
      ) {
        onDropGroup(drag.host.id, drag.overGroup);
      }
    },
  });

  const handleHostPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    host: HostProfileSummaryDto,
    sourceGroup: string
  ) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    beginDrag({
      host,
      sourceGroup,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      overGroup: null,
    });
  };

  return {
    dragPreview,
    suppressDblClickRef,
    handleHostPointerDown,
  };
}
