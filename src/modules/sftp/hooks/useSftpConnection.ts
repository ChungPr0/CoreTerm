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

  const mountedRef = useRef(true);
  const connStateRef = useRef(connState);
  const connectAttemptRef = useRef(0);
  const connectingAttemptRef = useRef(0);
  const reconnectTokenRef = useRef(reconnectToken);

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
      remoteRef.current.setHomeDir(ack.home_path);
      setConnState("CONNECTED");
      onSftpStateRef.current?.(tabId, "CONNECTED");

      const targetRemote = remoteRef.current.cwdRef.current || ack.cwd || ack.home_path;
      const [drives, homeDir, existingJobs] = await Promise.all([
        localFsApi.localListDrives().catch(() => [] as LocalDriveDto[]),
        localFsApi.localHomeDir().catch(() => ""),
        sftpApi.sftpListTransfers(tabId).catch(() => [] as SftpTransferJobDto[]),
      ]);
      if (isStale()) return;

      setLocalDrives(drives);
      if (homeDir && !localRef.current.homeRef.current) {
        localRef.current.setHomeDir(homeDir);
      }
      onHydrateJobsRef.current(existingJobs);

      await Promise.all([
        remoteRef.current.loadDir(targetRemote, isStale),
        localRef.current.loadDir(
          localRef.current.cwdRef.current || homeDir || drives[0]?.path || "",
          isStale
        ),
      ]);
    } catch (err) {
      if (isStale()) return;
      if (
        /authentication cancelled|authentication failed|host key verification|known_hosts/i.test(
          extractRawErrorMessage(err)
        )
      ) {
        setAuthBlocked(true);
      }
      setConnState("ERROR");
      onSftpStateRef.current?.(tabId, "ERROR");
      onErrorRef.current(err);
    } finally {
      if (connectingAttemptRef.current === attempt) {
        connectingAttemptRef.current = 0;
      }
    }
  }, [tabId, hostId]);

  useEffect(() => {
    void connectSftp();
    return () => {
      connectAttemptRef.current += 1;
    };
  }, [connectSftp]);

  useEffect(() => {
    if (reconnectTokenRef.current === reconnectToken) return;
    reconnectTokenRef.current = reconnectToken;
    setAuthBlocked(false);
    void connectSftp();
  }, [reconnectToken, connectSftp]);

  const sftpOffline = connState === "DISCONNECTED" || connState === "ERROR";

  useAutoReconnect(
    hostId !== "local" && Boolean(autoReconnect) && !authBlocked,
    sftpOffline,
    reconnectIntervalSec,
    () => {
      void connectSftp();
    }
  );

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
    setAuthBlocked,
    connectSftp,
    handleStatus,
    markDisconnectedOnError,
  };
}
