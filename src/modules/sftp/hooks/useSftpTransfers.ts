import { useCallback, useEffect, useRef, useState } from "react";
import { open as openNativeDialog } from "@tauri-apps/plugin-dialog";
import type { SftpConflictPolicy } from "@/shared/types/ipc";
import { sftpApi } from "../api/sftpApi";
import type {
  SftpConnectionState,
  SftpTransferConflictEventDto,
  SftpTransferJobDto,
} from "../types";
import type { ConflictAction } from "../components/ConflictModal";
import type { PendingTransfer } from "../components/TransferConfirmModal";
import type { DirectoryBrowser } from "./useDirectoryBrowser";

interface UseSftpTransfersOptions {
  tabId: string;
  connStateRef: React.MutableRefObject<SftpConnectionState>;
  showLocalRef: React.MutableRefObject<boolean>;
  conflictPolicy: SftpConflictPolicy;
  remoteBrowser: DirectoryBrowser;
  localBrowser: DirectoryBrowser;
  onError: (err: unknown) => void;
}

export function useSftpTransfers({
  tabId,
  connStateRef,
  showLocalRef,
  conflictPolicy,
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
  const conflictsRef = useRef(conflicts);
  const alertedJobsRef = useRef(new Set<string>());
  const remoteRefreshTimerRef = useRef<number | null>(null);
  const localRefreshTimerRef = useRef<number | null>(null);
  const remoteRef = useRef(remoteBrowser);
  const localRef = useRef(localBrowser);
  const onErrorRef = useRef(onError);

  policyRef.current = conflictPolicy;
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
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current) browserRef.current.refresh();
    }, 250);
  }, []);

  const runTransfer = useCallback(
    async (pending: PendingTransfer) => {
      const added =
        pending.direction === "upload"
          ? await sftpApi.sftpUpload(tabId, pending.paths, pending.destDir, policyRef.current)
          : await sftpApi.sftpDownload(tabId, pending.paths, pending.destDir, policyRef.current);
      if (!mountedRef.current) return;
      setJobs((prev) => {
        const seen = new Set(added.map((j) => j.job_id));
        return [...added, ...prev.filter((j) => !seen.has(j.job_id))];
      });
      setQueueOpen(true);
    },
    [tabId]
  );

  const requestUpload = useCallback((localPaths: string[]) => {
    const destDir = remoteRef.current.cwdRef.current;
    if (connStateRef.current !== "CONNECTED" || !destDir || localPaths.length === 0) return;
    setPendingTransfer({ direction: "upload", paths: localPaths, destDir });
  }, [connStateRef]);

  const requestDownload = useCallback(
    async (remotePaths: string[]) => {
      if (connStateRef.current !== "CONNECTED" || remotePaths.length === 0) return;
      let destDir = showLocalRef.current ? localRef.current.cwdRef.current : "";
      if (!destDir) {
        const picked = await openNativeDialog({
          directory: true,
          defaultPath: localRef.current.homeRef.current || localRef.current.cwdRef.current || undefined,
        });
        if (!picked || !mountedRef.current) return;
        destDir = Array.isArray(picked) ? picked[0] : picked;
      }
      if (!destDir) return;
      setPendingTransfer({ direction: "download", paths: remotePaths, destDir });
    },
    [connStateRef, showLocalRef]
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
    (jobId: string) => void sftpApi.sftpPauseTransfer(tabId, jobId).catch(onErrorRef.current),
    [tabId]
  );
  const resumeTransfer = useCallback(
    (jobId: string) => void sftpApi.sftpResumeTransfer(tabId, jobId).catch(onErrorRef.current),
    [tabId]
  );
  const cancelTransfer = useCallback(
    (jobId: string) => void sftpApi.sftpCancelTransfer(tabId, jobId).catch(onErrorRef.current),
    [tabId]
  );
  const clearFinished = useCallback(() => {
    void sftpApi
      .sftpClearFinishedTransfers(tabId)
      .then(() => {
        setJobs((prev) => {
          const active = prev.filter(
            (j) => j.status === "QUEUED" || j.status === "RUNNING" || j.status === "PAUSED"
          );
          const activeIds = new Set(active.map((j) => j.job_id));
          for (const id of alertedJobsRef.current) {
            if (!activeIds.has(id)) alertedJobsRef.current.delete(id);
          }
          return active;
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
