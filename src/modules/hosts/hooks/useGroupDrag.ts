import React, { useState } from "react";
import { usePointerDrag, type PointerDragBase } from "@/shared/hooks/usePointerDrag";

export interface GroupDragPreview {
  groupName: string;
  count: number;
  clientX: number;
  clientY: number;
  insertIndex: number | null;
}

interface ActiveGroupDrag extends PointerDragBase {
  groupName: string;
  count: number;
  sourceIndex: number;
  insertIndex: number | null;
}

interface UseGroupDragOpts {
  enabled: boolean;
  groupOrder: string[];
  listScrollRef: React.RefObject<HTMLDivElement | null>;
  groupElsRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onReorderGroups: (orderedNames: string[]) => void;
}

export function computeGroupInsertIndex(
  midpointsY: Array<number | null>,
  clientY: number,
  sourceIndex: number
): number | null {
  let rawSlot = midpointsY.length;
  for (let i = 0; i < midpointsY.length; i++) {
    const midY = midpointsY[i];
    if (midY !== null && clientY < midY) {
      rawSlot = i;
      break;
    }
  }
  if (rawSlot === sourceIndex || rawSlot === sourceIndex + 1) return null;
  return rawSlot;
}

export function applyGroupReorder(
  groupOrder: string[],
  sourceIndex: number,
  insertIndex: number
): string[] {
  if (sourceIndex < 0 || sourceIndex >= groupOrder.length) return groupOrder;
  const next = [...groupOrder];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return groupOrder;
  const destIndex = insertIndex > sourceIndex ? insertIndex - 1 : insertIndex;
  next.splice(destIndex, 0, moved);
  return next;
}

/** Handles vertical pointer drag reordering for host groups in the sidebar. */
export function useGroupDrag({
  enabled,
  groupOrder,
  listScrollRef,
  groupElsRef,
  onReorderGroups,
}: UseGroupDragOpts) {
  const [groupDragPreview, setGroupDragPreview] = useState<GroupDragPreview | null>(null);

  const measureInsertIndex = (clientY: number, sourceIndex: number): number | null => {
    const midpoints = groupOrder.map((name) => {
      const el = groupElsRef.current.get(name);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    return computeGroupInsertIndex(midpoints, clientY, sourceIndex);
  };

  const toPreview = (drag: ActiveGroupDrag): GroupDragPreview => ({
    groupName: drag.groupName,
    count: drag.count,
    clientX: drag.clientX,
    clientY: drag.clientY,
    insertIndex: drag.insertIndex,
  });

  const { suppressRef: suppressGroupClickRef, beginDrag } = usePointerDrag<ActiveGroupDrag>({
    enabled,
    cancelOnEscape: true,
    suppressClickMs: 120,
    scrollElRef: listScrollRef,
    onActivate: (drag) => {
      window.getSelection()?.removeAllRanges();
      drag.insertIndex = measureInsertIndex(drag.clientY, drag.sourceIndex);
      setGroupDragPreview(toPreview(drag));
    },
    onMove: (drag, e) => {
      drag.insertIndex = measureInsertIndex(e.clientY, drag.sourceIndex);
      setGroupDragPreview(toPreview(drag));
    },
    onAutoScrollTick: (drag) => {
      const nextSlot = measureInsertIndex(drag.clientY, drag.sourceIndex);
      if (nextSlot !== drag.insertIndex) {
        drag.insertIndex = nextSlot;
        setGroupDragPreview(toPreview(drag));
      }
      return true;
    },
    onEnd: (drag, commit) => {
      setGroupDragPreview(null);
      if (!commit || !drag?.isDragging || drag.insertIndex === null) return;
      onReorderGroups(applyGroupReorder(groupOrder, drag.sourceIndex, drag.insertIndex));
    },
  });

  const handleGroupPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    groupName: string,
    count: number
  ) => {
    if (!enabled || e.button !== 0) return;
    const sourceIndex = groupOrder.findIndex(
      (g) => g.toLowerCase() === groupName.toLowerCase()
    );
    if (sourceIndex === -1) return;
    beginDrag({
      groupName,
      count,
      sourceIndex,
      insertIndex: null,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    });
  };

  return {
    groupDragPreview,
    suppressGroupClickRef,
    handleGroupPointerDown,
  };
}
