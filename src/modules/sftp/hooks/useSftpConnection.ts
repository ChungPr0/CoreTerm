import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
import { useTabsStore } from "@/modules/workspace/hooks/useTabsStore";
import { extractRawErrorMessage } from "@/shared/utils/formatError";
import { localFsApi } from "../api/localFsApi";
import { sftpApi } from "../api/sftpApi";
import type { LocalDriveDto, SftpConnectionState, SftpTransferJobDto } from "../types";
import type { DirectoryBrowser } from "./useDirectoryBrowser";

interface UseSftpConnectionOptions {
  tabId: string;
  hostId: string;
  reconnectToken: number;
  autoReconnect?: boolean;
  canAutoReconnect?: boolean;
  pauseAutoReconnect?: boolean;
  reconnectIntervalSec?: number;
  remoteBrowser: DirectoryBrowser;
  localBrowser: DirectoryBrowser;
  enabled?: boolean;
  onSftpState?: (tabId: string, state: SftpConnectionState) => void;
  onHydrateJobs: (jobs: SftpTransferJobDto[]) => void;
  onError: (err: unknown) => void;
}

export function useSftpConnection({
  tabId,
  hostId,
  reconnectToken,
  autoReconnect,
  canAutoReconnect,
  pauseAutoReconnect = false,
  reconnectIntervalSec,
  remoteBrowser,
  localBrowser,
  enabled = true,
  onSftpState,
  onHydrateJobs,
  onError,
}: UseSftpConnectionOptions) {
  const [connState, setConnState] = useState<SftpConnectionState>(
    enabled ? "CONNECTING" : "DISCONNECTED"
  );
  const [authBlocked, setAuthBlocked] = useState(false);
  const [localDrives, setLocalDrives] = useState<LocalDriveDto[]>([]);
  const [remoteDrives, setRemoteDrives] = useState<LocalDriveDto[]>([]);

  const mountedRef = useRef(true);
  const connStateRef = useRef(connState);
  const connectAttemptRef = useRef(0);
  const connectingAttemptRef = useRef(0);
  const reconnectTokenRef = useRef(reconnectToken);
  const lastErrRef = useRef<string | null>(null);

  const remoteRef = useRef(remoteBrowser);
  const localRef = useRef(localBrowser);
  const onSftpStateRef = useRef(onSftpState);
  const onHydrateJobsRef = useRef(onHydrateJobs);
  const onErrorRef = useRef(onError);

  connStateRef.current = connState;
  remoteRef.current = remoteBrowser;
  localRef.current = localBrowser;
  onSftpStateRef.current = onSftpState;
  onHydrateJobsRef.current = onHydrateJobs;
  onErrorRef.current = onError;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (hostId !== "local") {
        void sftpApi.sftpDisconnect(tabId).catch(() => {});
      }
    };
  }, [hostId, tabId]);

  const markDisconnectedOnError = useCallback(() => {
    setConnState("ERROR");
    onSftpStateRef.current?.(tabId, "ERROR");
  }, [tabId]);

  const connectSftp = useCallback(async () => {
    if (hostId === "local") return;
    const attempt = ++connectAttemptRef.current;
    connectingAttemptRef.current = attempt;
    const isStale = () => !mountedRef.current || connectAttemptRef.current !== attempt;

    setConnState("CONNECTING");
    onSftpStateRef.current?.(tabId, "CONNECTING");

    try {
      const ack = await sftpApi.sftpConnect(tabId, hostId);
      if (isStale()) return;

      setAuthBlocked(false);
      lastErrRef.current = null;
      setRemoteDrives(ack.drives ?? []);
      const safeHome = ack.home_path || "";
      if (safeHome) {
        remoteRef.current.setHomeDir(safeHome);
      }
      setConnState("CONNECTED");
      onSftpStateRef.current?.(tabId, "CONNECTED");

      const targetRemote = remoteRef.current.cwdRef.current || ack.cwd || safeHome;
      const existingJobs = await sftpApi
        .sftpListTransfers(tabId)
        .catch(() => [] as SftpTransferJobDto[]);
      if (isStale()) return;

      onHydrateJobsRef.current(existingJobs);
      if (targetRemote) {
        await remoteRef.current.loadDir(targetRemote, isStale);
      }
    } catch (err) {
      if (isStale()) return;
      const rawMsg = extractRawErrorMessage(err);
      if (
        /authentication cancelled|authentication failed|host key verification|known_hosts/i.test(
          rawMsg
        )
      ) {
        setAuthBlocked(true);
      }
      setConnState("ERROR");
      onSftpStateRef.current?.(tabId, "ERROR");
      if (!rawMsg || lastErrRef.current !== rawMsg) {
        lastErrRef.current = rawMsg || "ERROR";
        onErrorRef.current(err);
      }
    } finally {
      if (connectingAttemptRef.current === attempt) {
        connectingAttemptRef.current = 0;
      }
    }
  }, [tabId, hostId]);

  const loadLocalFs = useCallback(async () => {
    const [drives, homeDir] = await Promise.all([
      localFsApi.localListDrives().catch(() => [] as LocalDriveDto[]),
      localFsApi.localHomeDir().catch(() => ""),
    ]);
    if (!mountedRef.current) return;

    setLocalDrives(drives);
    if (homeDir && !localRef.current.homeRef.current) {
      localRef.current.setHomeDir(homeDir);
    }
    const targetLocal = localRef.current.cwdRef.current || homeDir || drives[0]?.path || "";
    if (targetLocal && !localRef.current.cwdRef.current) {
      await localRef.current.loadDir(targetLocal, () => !mountedRef.current);
    }
  }, []);

  const refreshLocalDrives = useCallback(async () => {
    try {
      const drives = await localFsApi.localListDrives();
      if (mountedRef.current) {
        setLocalDrives(drives);
      }
      return drives;
    } catch {
      return [];
    }
  }, []);

  const refreshLocalFs = useCallback(async () => {
    const drives = await localFsApi.localListDrives().catch(() => [] as LocalDriveDto[]);
    if (!mountedRef.current) return;
    setLocalDrives(drives);

    const curCwd = localRef.current.cwdRef.current;
    if (curCwd) {
      const curDrive = drives.find(
        (d) =>
          curCwd.toLowerCase().startsWith(d.path.toLowerCase()) ||
          `${curCwd.toLowerCase().replace(/[\\/]+$/, "")}\\` === d.path.toLowerCase()
      );
      if (!curDrive && drives.length > 0) {
        const fallback = localRef.current.homeRef.current || drives[0].path;
        await localRef.current.loadDir(fallback, () => !mountedRef.current);
        return;
      }
    }
    localRef.current.refresh();
  }, []);

  // Load local filesystem immediately without waiting on remote SFTP auth/network.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mountedRef.current) void loadLocalFs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocalFs]);

  // Initial or state-driven SFTP connect: only runs when enabled (e.g. pure SFTP tab or SSH is online)
  useEffect(() => {
    if (!enabled) {
      setConnState("DISCONNECTED");
      onSftpStateRef.current?.(tabId, "DISCONNECTED");
      if (hostId !== "local") {
        void sftpApi.sftpDisconnect(tabId).catch(() => {});
      }
      return;
    }

    setAuthBlocked(false);
    lastErrRef.current = null;
    const timer = window.setTimeout(() => {
      if (mountedRef.current) void connectSftp();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      connectAttemptRef.current += 1;
    };
  }, [enabled, connectSftp, hostId, tabId]);

  useEffect(() => {
    if (!enabled) return;
    if (reconnectTokenRef.current === reconnectToken) return;
    reconnectTokenRef.current = reconnectToken;
    setAuthBlocked(false);
    lastErrRef.current = null;
    void connectSftp();
  }, [enabled, reconnectToken, connectSftp]);

  const sftpOffline = connState === "DISCONNECTED" || connState === "ERROR";

  useAutoReconnect({
    enabled:
      enabled &&
      hostId !== "local" &&
      canAutoReconnect !== false &&
      Boolean(autoReconnect) &&
      !authBlocked,
    connected: connState === "CONNECTED",
    disconnected: sftpOffline,
    paused: pauseAutoReconnect,
    intervalSec: reconnectIntervalSec,
    onReconnect: () => {
      useTabsStore.getState().bumpReconnectToken(tabId, "auto");
      void connectSftp();
    },
  });

  const clearErrorDedup = useCallback(() => {
    lastErrRef.current = null;
  }, []);

  const handleStatus = useCallback(
    (state: SftpConnectionState, _cwd?: string | null, err?: string | null) => {
      if (
        connectingAttemptRef.current !== 0 &&
        (state === "ERROR" || state === "DISCONNECTED")
      ) {
        return;
      }
      setConnState(state);
      onSftpStateRef.current?.(tabId, state);
      if (err && connectingAttemptRef.current === 0) {
        onErrorRef.current(err);
      }
    },
    [tabId]
  );

  return {
    connState,
    connStateRef,
    sftpOffline,
    localDrives,
    remoteDrives,
    setAuthBlocked,
    clearErrorDedup,
    connectSftp,
    loadLocalFs,
    refreshLocalDrives,
    refreshLocalFs,
    handleStatus,
    markDisconnectedOnError,
  };
}
