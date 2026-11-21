import type React from "react";
import { useCallback, useRef, useState } from "react";
import { usePointerDrag, type PointerDragBase } from "@/shared/hooks/usePointerDrag";

export type SftpPaneKind = "local" | "remote";

export interface SftpDragPreview {
  fromKind: SftpPaneKind;
  targetKind: SftpPaneKind | null;
  targetDir?: string | null;
  targetDirName?: string | null;
  label: string;
  count: number;
  clientX: number;
  clientY: number;
}

interface ActiveSftpDrag extends PointerDragBase {
  fromKind: SftpPaneKind;
  paths: string[];
  label: string;
  targetKind: SftpPaneKind | null;
  targetDir?: string | null;
  targetDirName?: string | null;
}

interface UseSftpFileDragOpts {
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onDropTransfer: (fromKind: SftpPaneKind, paths: string[], targetDir?: string) => void;
}

/**
 * Pointer-based cross-pane file drag & drop.
 * Avoids HTML5 `draggable` so it keeps working when Tauri's native OS drop hook is active on Windows.
 */
export function useSftpFileDrag({
  enabled,
  containerRef,
  onDropTransfer,
}: UseSftpFileDragOpts) {
  const [dragPreview, setDragPreview] = useState<SftpDragPreview | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const findTargetPane = useCallback(
    (fromKind: SftpPaneKind, clientX: number, clientY: number): SftpPaneKind | null => {
      const target: SftpPaneKind = fromKind === "local" ? "remote" : "local";
      const paneEl = containerRef.current?.querySelector<HTMLElement>(
        `[data-sftp-pane="${target}"]`
      );
      if (!paneEl) return null;
      const r = paneEl.getBoundingClientRect();
      if (
        r.width > 0 &&
        r.height > 0 &&
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return target;
      }
      return null;
    },
    [containerRef]
  );

  const { suppressRef, beginDrag } = usePointerDrag<ActiveSftpDrag>({
    enabled,
    cancelOnEscape: true,
    suppressClickMs: 60,
    onActivate: () => {
      window.getSelection()?.removeAllRanges();
    },
    onMove: (drag, e) => {
      const targetKind = findTargetPane(drag.fromKind, e.clientX, e.clientY);
      drag.targetKind = targetKind;

      let targetDir: string | null = null;
      let targetDirName: string | null = null;

      if (targetKind) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const rowEl = el?.closest<HTMLElement>("[data-sftp-dir-row]");
        if (rowEl) {
          const rowPane = rowEl.closest<HTMLElement>("[data-sftp-pane]")?.getAttribute("data-sftp-pane");
          if (rowPane === targetKind) {
            targetDir = rowEl.getAttribute("data-sftp-dir-path");
            targetDirName = rowEl.getAttribute("data-sftp-dir-name");
          }
        }
      }

      drag.targetDir = targetDir;
      drag.targetDirName = targetDirName;

      document.body.style.cursor = targetKind ? "copy" : "grabbing";
      setDragPreview({
        fromKind: drag.fromKind,
        targetKind,
        targetDir,
        targetDirName,
        label: drag.label,
        count: drag.paths.length,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    },
    onEnd: (drag, commit) => {
      setDragPreview(null);
      if (commit && drag?.isDragging && drag.targetKind) {
        onDropTransfer(drag.fromKind, drag.paths, drag.targetDir || undefined);
      }
    },
  });

  const startDrag = useCallback(
    (
      fromKind: SftpPaneKind,
      paths: string[],
      label: string,
      e: React.PointerEvent<HTMLElement>
    ) => {
      if (!enabledRef.current || e.button !== 0 || paths.length === 0) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      beginDrag({
        fromKind,
        paths,
        label,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        targetKind: null,
      });
    },
    [beginDrag]
  );

  const shouldSuppressClick = useCallback(() => suppressRef.current, [suppressRef]);

  return { dragPreview, startDrag, shouldSuppressClick };
}
