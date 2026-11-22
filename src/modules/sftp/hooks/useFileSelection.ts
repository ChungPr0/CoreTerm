import { useCallback, useMemo, useRef } from "react";
import type { FileItem } from "../types";
import { getEditableInput } from "@/shared/utils/editableTarget";

interface UseFileSelectionOptions {
  visibleItems: FileItem[];
  selected: string[];
  onSelect: (paths: string[]) => void;
  onNavigate: (path: string) => void;
  onOpenFile?: (item: FileItem) => void;
  onBack?: () => void;
  onForward?: () => void;
  onUp: () => void;
  onRenameItem: (item: FileItem) => void;
  onDeletePaths: (paths: string[]) => void;
}

export function useFileSelection({
  visibleItems,
  selected,
  onSelect,
  onNavigate,
  onOpenFile,
  onBack,
  onForward,
  onUp,
  onRenameItem,
  onDeletePaths,
}: UseFileSelectionOptions) {
  const lastAnchorRef = useRef<string | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const handleRowClick = useCallback(
    (item: FileItem, idx: number, e: React.MouseEvent) => {
      if (e.shiftKey && lastAnchorRef.current) {
        const anchorIdx = visibleItems.findIndex((i) => i.path === lastAnchorRef.current);
        if (anchorIdx >= 0) {
          const [from, to] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
          onSelect(visibleItems.slice(from, to + 1).map((i) => i.path));
          return;
        }
      }
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(selected);
        if (next.has(item.path)) next.delete(item.path);
        else next.add(item.path);
        onSelect(Array.from(next));
        lastAnchorRef.current = item.path;
        return;
      }
      onSelect([item.path]);
      lastAnchorRef.current = item.path;
    },
    [visibleItems, selected, onSelect]
  );

  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        getEditableInput(e.target) ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable || e.target.tagName === "SELECT"))
      ) {
        return;
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        onBack?.();
        return;
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        onForward?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        onSelect(visibleItems.map((i) => i.path));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        onUp();
        return;
      }
      if (e.key === "Delete" && selected.length > 0) {
        e.preventDefault();
        onDeletePaths(selected);
        return;
      }
      if (selected.length !== 1) return;
      const item = visibleItems.find((i) => i.path === selected[0]);
      if (!item) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (item.isDir) onNavigate(item.path);
        else onOpenFile?.(item);
      } else if (e.key === "F2") {
        e.preventDefault();
        onRenameItem(item);
      }
    },
    [
      visibleItems,
      selected,
      onBack,
      onForward,
      onSelect,
      onUp,
      onDeletePaths,
      onNavigate,
      onOpenFile,
      onRenameItem,
    ]
  );

  return {
    selectedSet,
    handleRowClick,
    handleContainerKeyDown,
  };
}
