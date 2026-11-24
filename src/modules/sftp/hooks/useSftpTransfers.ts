import { useCallback, useEffect, useRef, useState } from "react";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import type { SftpConflictPolicy } from "@/shared/types/ipc";
import { extractRawErrorMessage } from "@/shared/utils/formatError";
import { sftpApi } from "../api/sftpApi";
import type {
  SftpConnectionState,
  SftpTransferConflictEventDto,
  SftpTransferJobDto,
} from "../types";
import type { ConflictAction } from "../components/ConflictModal";
import type { PendingTransfer } from "../components/TransferConfirmModal";
import type { DirectoryBrowser } from "./useDirectoryBrowser";
import { resolveItemInCwd } from "./fileListUtils";

interface UseSftpTransfersOptions {
  tabId: string;
  connStateRef: React.MutableRefObject<SftpConnectionState>;
  showLocalRef: React.MutableRefObject<boolean>;
  conflictPolicy: SftpConflictPolicy;
  confirmBeforeTransfer?: boolean;
  remoteBrowser: DirectoryBrowser;
  localBrowser: DirectoryBrowser;
  onError: (err: unknown) => void;
}

function pathBaseName(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, "");
  return trimmed.split(/[\\/]/).pop() || p;
}

export function useSftpTransfers({
  tabId,
  connStateRef,
  showLocalRef,
  conflictPolicy,
  confirmBeforeTransfer = true,
  remoteBrowser,
  localBrowser,
  onError,
}: UseSftpTransfersOptions) {
  const [jobs, setJobs] = useState<SftpTransferJobDto[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [conflicts, setConflicts] = useState<SftpTransferConflictEventDto[]>([]);
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);

  const mountedRef = useRef(true);
  const transferBusyRef = useRef(false);
  const policyRef = useRef(conflictPolicy);
  const confirmBeforeTransferRef = useRef(confirmBeforeTransfer);
  const conflictsRef = useRef(conflicts);
  const alertedJobsRef = useRef(new Set<string>());
  const remoteRefreshTimerRef = useRef<number | null>(null);
  const localRefreshTimerRef = useRef<number | null>(null);
  const pendingHighlightRef = useRef<{ local: Set<string>; remote: Set<string> }>({
    local: new Set(),
    remote: new Set(),
  });
  const remoteRef = useRef(remoteBrowser);
  const localRef = useRef(localBrowser);
  const onErrorRef = useRef(onError);

  policyRef.current = conflictPolicy;
  confirmBeforeTransferRef.current = confirmBeforeTransfer;
  conflictsRef.current = conflicts;
  remoteRef.current = remoteBrowser;
  localRef.current = localBrowser;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (remoteRefreshTimerRef.current !== null) {
        window.clearTimeout(remoteRefreshTimerRef.current);
      }
      if (localRefreshTimerRef.current !== null) {
        window.clearTimeout(localRefreshTimerRef.current);
      }
    };
  }, []);

  const scheduleDirRefresh = useCallback((direction: "UPLOAD" | "DOWNLOAD") => {
    const timerRef = direction === "UPLOAD" ? remoteRefreshTimerRef : localRefreshTimerRef;
    const browserRef = direction === "UPLOAD" ? remoteRef : localRef;
    const targetKind = direction === "UPLOAD" ? "remote" : "local";
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current) {
        const highlightSet = pendingHighlightRef.current[targetKind];
        const highlightList = Array.from(highlightSet);
        highlightSet.clear();
        browserRef.current.refresh(highlightList.length > 0 ? highlightList : undefined);
      }
    }, 250);
  }, []);

  const runTransfer = useCallback(
    async (pending: PendingTransfer) => {
      const targetKind = pending.direction === "upload" ? "remote" : "local";
      const browserRef = targetKind === "remote" ? remoteRef : localRef;
      const curCwd = browserRef.current.cwdRef.current;
      if (curCwd) {
        const itemInCwd = resolveItemInCwd(curCwd, pending.destDir);
        if (itemInCwd) {
          pendingHighlightRef.current[targetKind].add(itemInCwd);
        } else {
          for (const p of pending.paths) {
            const fileName = pathBaseName(p);
            const sep = curCwd.includes("\\") ? "\\" : "/";
            const fullPath = `${curCwd.replace(/[\\/]+$/, "")}${sep}${fileName}`;
            pendingHighlightRef.current[targetKind].add(fullPath);
          }
        }
      }
      const added =
        pending.direction === "upload"
          ? await sftpApi.sftpUpload(tabId, pending.paths, pending.destDir, policyRef.current)
          : await sftpApi.sftpDownload(tabId, pending.paths, pending.destDir, policyRef.current);
      if (!mountedRef.current) return;
      scheduleDirRefresh(pending.direction === "upload" ? "UPLOAD" : "DOWNLOAD");
      setJobs((prev) => {
        const prevMap = new Map(prev.map((j) => [j.job_id, j]));
        // Keep updated status from prev if the job already started or completed in background
        const mergedAdded = added.map((newJob) => prevMap.get(newJob.job_id) || newJob);
        const seen = new Set(added.map((j) => j.job_id));
        return [...mergedAdded, ...prev.filter((j) => !seen.has(j.job_id))];
      });
      setQueueOpen(true);
    },
    [tabId, scheduleDirRefresh]
  );

  const requestUpload = useCallback((localPaths: string[], targetDestDir?: string) => {
    const destDir = targetDestDir || remoteRef.current.cwdRef.current;
    if (connStateRef.current !== "CONNECTED" || !destDir || localPaths.length === 0) return;
    const pending: PendingTransfer = { direction: "upload", paths: localPaths, destDir };
    if (!confirmBeforeTransferRef.current) {
      void runTransfer(pending).catch((err) => {
        if (mountedRef.current) onErrorRef.current(err);
      });
      return;
    }
    setPendingTransfer(pending);
  }, [connStateRef, runTransfer]);

  const requestDownload = useCallback(
    async (remotePaths: string[], targetDestDir?: string) => {
      if (connStateRef.current !== "CONNECTED" || remotePaths.length === 0) return;
      let destDir = targetDestDir || (showLocalRef.current ? localRef.current.cwdRef.current : "");
      if (!destDir) {
        const picked = await openNativeDialog({
          directory: true,
          defaultPath: localRef.current.homeRef.current || localRef.current.cwdRef.current || undefined,
        });
        if (!picked || !mountedRef.current) return;
        destDir = Array.isArray(picked) ? picked[0] : picked;
      }
      if (!destDir) return;
      const pending: PendingTransfer = { direction: "download", paths: remotePaths, destDir };
      if (!confirmBeforeTransferRef.current) {
        void runTransfer(pending).catch((err) => {
          if (mountedRef.current) onErrorRef.current(err);
        });
        return;
      }
      setPendingTransfer(pending);
    },
    [connStateRef, runTransfer, showLocalRef]
  );

  const confirmPendingTransfer = useCallback(async () => {
    if (!pendingTransfer || transferBusyRef.current) return;
    transferBusyRef.current = true;
    setTransferBusy(true);
    try {
      await runTransfer(pendingTransfer);
    } catch (err) {
      if (mountedRef.current) onErrorRef.current(err);
    } finally {
      transferBusyRef.current = false;
      if (mountedRef.current) {
        setTransferBusy(false);
        setPendingTransfer(null);
      }
    }
  }, [pendingTransfer, runTransfer]);

  const cancelPendingTransfer = useCallback(() => {
    if (!transferBusyRef.current) setPendingTransfer(null);
  }, []);

  const uploadViaDialog = useCallback(
    async (directory: boolean) => {
      if (connStateRef.current !== "CONNECTED") return;
      const picked = await openNativeDialog({ multiple: !directory, directory });
      if (!picked || !mountedRef.current) return;
      requestUpload(Array.isArray(picked) ? picked : [picked]);
    },
    [connStateRef, requestUpload]
  );

  const handleProgress = useCallback((job: SftpTransferJobDto) => {
    setJobs((prev) => {
      const idx = prev.findIndex((j) => j.job_id === job.job_id);
      if (idx < 0) return [job, ...prev];
      const next = [...prev];
      next[idx] = job;
      return next;
    });
    if (job.status === "FAILED" && job.error_message && !alertedJobsRef.current.has(job.job_id)) {
      alertedJobsRef.current.add(job.job_id);
      onErrorRef.current(job.error_message);
    } else if (job.status === "COMPLETED") {
      if (job.direction === "UPLOAD" || job.direction === "DOWNLOAD") {
        const targetKind = job.direction === "UPLOAD" ? "remote" : "local";
        const browserRef = targetKind === "remote" ? remoteRef : localRef;
        const curCwd = browserRef.current.cwdRef.current;
        if (curCwd && job.dest_path) {
          const itemInCwd = resolveItemInCwd(curCwd, job.dest_path);
          if (itemInCwd) {
            pendingHighlightRef.current[targetKind].add(itemInCwd);
          }
        }
        scheduleDirRefresh(job.direction);
      }
    }
  }, [scheduleDirRefresh]);

  const handleConflict = useCallback((conflict: SftpTransferConflictEventDto) => {
    setConflicts((prev) =>
      prev.some((c) => c.conflict_id === conflict.conflict_id) ? prev : [...prev, conflict]
    );
  }, []);

  const resolveConflict = useCallback(
    async (action: ConflictAction, applyAll: boolean) => {
      const active = conflictsRef.current[0];
      if (!active) return;
      setConflicts((prev) => prev.filter((c) => c.conflict_id !== active.conflict_id));
      try {
        await sftpApi.sftpResolveConflict(tabId, active.conflict_id, action, applyAll);
      } catch (err) {
        onErrorRef.current(err);
      }
    },
    [tabId]
  );

  const pauseTransfer = useCallback(
    (jobId: string) => {
      void sftpApi.sftpPauseTransfer(tabId, jobId).catch((err) => {
        const msg = extractRawErrorMessage(err);
        if (/not found/i.test(msg)) {
          setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
        } else {
          onErrorRef.current(err);
        }
      });
    },
    [tabId]
  );
  const resumeTransfer = useCallback(
    (jobId: string) => {
      void sftpApi.sftpResumeTransfer(tabId, jobId).catch((err) => {
        const msg = extractRawErrorMessage(err);
        if (/not found/i.test(msg)) {
          setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
        } else {
          onErrorRef.current(err);
        }
      });
    },
    [tabId]
  );
  const cancelTransfer = useCallback(
    (jobId: string) => {
      void sftpApi.sftpCancelTransfer(tabId, jobId).catch((err) => {
        const msg = extractRawErrorMessage(err);
        if (/not found/i.test(msg)) {
          setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
        } else {
          onErrorRef.current(err);
        }
      });
    },
    [tabId]
  );
  const clearFinished = useCallback(() => {
    void sftpApi
      .sftpClearFinishedTransfers(tabId)
      .then(() => sftpApi.sftpListTransfers(tabId))
      .then((backendJobs) => {
        if (!mountedRef.current) return;
        setJobs((prev) => {
          const backendSet = new Map(backendJobs.map((j) => [j.job_id, j]));
          const reconciled = prev
            .filter((j) => {
              if (
                j.status === "COMPLETED" ||
                j.status === "FAILED" ||
                j.status === "SKIPPED" ||
                j.status === "CANCELLED"
              ) {
                return false;
              }
              return backendSet.has(j.job_id);
            })
            .map((j) => backendSet.get(j.job_id) || j);

          const activeIds = new Set(reconciled.map((j) => j.job_id));
          for (const id of alertedJobsRef.current) {
            if (!activeIds.has(id)) alertedJobsRef.current.delete(id);
          }
          return reconciled;
        });
      })
      .catch(onErrorRef.current);
  }, [tabId]);

  return {
    jobs,
    setJobs,
    queueOpen,
    setQueueOpen,
    conflicts,
    pendingTransfer,
    transferBusy,
    requestUpload,
    requestDownload,
    confirmPendingTransfer,
    cancelPendingTransfer,
    uploadViaDialog,
    handleProgress,
    handleConflict,
    resolveConflict,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    clearFinished,
  };
}
