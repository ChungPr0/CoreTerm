import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoReconnect } from "@/shared/hooks/useAutoReconnect";
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
  pauseAutoReconnect?: boolean;
  reconnectIntervalSec?: number;
  remoteBrowser: DirectoryBrowser;
  localBrowser: DirectoryBrowser;
  onSftpState?: (tabId: string, state: SftpConnectionState) => void;
  onHydrateJobs: (jobs: SftpTransferJobDto[]) => void;
  onError: (err: unknown) => void;
}

export function useSftpConnection({
  tabId,
  hostId,
  reconnectToken,
  autoReconnect,
  pauseAutoReconnect = false,
  reconnectIntervalSec,
  remoteBrowser,
  localBrowser,
  onSftpState,
  onHydrateJobs,
  onError,
}: UseSftpConnectionOptions) {
  const [connState, setConnState] = useState<SftpConnectionState>("CONNECTING");
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
    };
  }, []);

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
      const safeHome = ack.home_path || "/";
      remoteRef.current.setHomeDir(safeHome);
      setConnState("CONNECTED");
      onSftpStateRef.current?.(tabId, "CONNECTED");

      const targetRemote = remoteRef.current.cwdRef.current || ack.cwd || safeHome;
      const existingJobs = await sftpApi
        .sftpListTransfers(tabId)
        .catch(() => [] as SftpTransferJobDto[]);
      if (isStale()) return;

      onHydrateJobsRef.current(existingJobs);
      await remoteRef.current.loadDir(targetRemote, isStale);
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

  // Load local filesystem immediately without waiting on remote SFTP auth/network.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mountedRef.current) void loadLocalFs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadLocalFs]);

  // Defer initial SFTP connect to a macrotask so React StrictMode double-mount cancels before opening duplicate SSH handshakes.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (mountedRef.current) void connectSftp();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      connectAttemptRef.current += 1;
    };
  }, [connectSftp]);

  useEffect(() => {
    if (reconnectTokenRef.current === reconnectToken) return;
    reconnectTokenRef.current = reconnectToken;
    setAuthBlocked(false);
    lastErrRef.current = null;
    void connectSftp();
  }, [reconnectToken, connectSftp]);

  const sftpOffline = connState === "DISCONNECTED" || connState === "ERROR";

  useAutoReconnect({
    enabled: hostId !== "local" && Boolean(autoReconnect) && !authBlocked,
    connected: connState === "CONNECTED",
    disconnected: sftpOffline,
    paused: pauseAutoReconnect,
    intervalSec: reconnectIntervalSec,
    onReconnect: () => {
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
    handleStatus,
    markDisconnectedOnError,
  };
}
