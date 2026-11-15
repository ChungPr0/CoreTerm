import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { sftpApi } from "../api/sftpApi";
import type {
  SftpConnectionState,
  SftpTransferConflictEventDto,
  SftpTransferJobDto,
} from "../types";

interface UseSftpEventsOpts {
  tabId: string;
  isActive: boolean;
  isVisible: boolean;
  remoteDropRef: React.RefObject<HTMLDivElement | null>;
  onStatus: (state: SftpConnectionState, cwd?: string | null, err?: string | null) => void;
  onProgress: (job: SftpTransferJobDto) => void;
  onConflict: (conflict: SftpTransferConflictEventDto) => void;
  onNativeDrop: (paths: string[]) => void;
}

export function useSftpEvents({
  tabId,
  isActive,
  isVisible,
  remoteDropRef,
  onStatus,
  onProgress,
  onConflict,
  onNativeDrop,
}: UseSftpEventsOpts): boolean {
  const [nativeDragActive, setNativeDragActive] = useState(false);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const fns = await Promise.all([
        sftpApi.onSftpStatus((ev) => {
          if (ev.tab_id === tabId) onStatus(ev.state, ev.cwd, ev.error_message);
        }),
        sftpApi.onSftpTransferProgress((job) => {
          if (job.tab_id === tabId) onProgress(job);
        }),
        sftpApi.onSftpTransferConflict((conflict) => {
          if (conflict.tab_id === tabId) onConflict(conflict);
        }),
      ]);
      if (!active) {
        fns.forEach((u) => u());
        return;
      }
      unlisteners.push(...fns);
    };
    void setup();

    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, [tabId, onStatus, onProgress, onConflict]);

  useEffect(() => {
    if (!isActive || !isVisible) {
      setNativeDragActive(false);
      return;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    const hitRemote = (pos?: { x: number; y: number } | null): boolean => {
      const el = remoteDropRef.current;
      if (!el || !pos) return false;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = pos.x / dpr;
      const y = pos.y / dpr;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (!active) return;
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setNativeDragActive(hitRemote(p.position));
        } else if (p.type === "leave") {
          setNativeDragActive(false);
        } else if (p.type === "drop") {
          const hit = hitRemote(p.position);
          setNativeDragActive(false);
          if (hit && p.paths.length > 0) {
            onNativeDrop(p.paths);
          }
        }
      })
      .then((fn) => {
        if (!active) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, [isActive, isVisible, remoteDropRef, onNativeDrop]);

  return nativeDragActive;
}
