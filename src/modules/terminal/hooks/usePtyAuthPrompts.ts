import { useCallback, useEffect, useState } from "react";
import { hostsApi, type HostProfileSummaryDto, type PortProbeResultDto } from "@/modules/hosts";
import {
  sftpApi,
  type SftpAuthPromptEventDto,
  type SftpHostKeyPromptEventDto,
} from "@/modules/sftp";
import { sessionApi } from "../api/sessionApi";
import type {
  ConflictStrategy,
  SessionAuthPromptEventDto,
  SessionHostKeyPromptEventDto,
} from "../types";

export function usePtyAuthPrompts(
  onSpawnHostTab: (host: HostProfileSummaryDto, strategy: ConflictStrategy) => void
) {
  const [authPrompt, setAuthPrompt] = useState<
    SessionAuthPromptEventDto | SftpAuthPromptEventDto | null
  >(null);
  const [authPromptSource, setAuthPromptSource] = useState<"pty" | "sftp">("pty");
  const [hostKeyPrompt, setHostKeyPrompt] = useState<
    SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto | null
  >(null);
  const [hostKeySource, setHostKeySource] = useState<"pty" | "sftp">("pty");
  const [pendingConflictHost, setPendingConflictHost] =
    useState<HostProfileSummaryDto | null>(null);
  const [portConflicts, setPortConflicts] = useState<PortProbeResultDto[]>([]);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    Promise.all([
      sessionApi.onAuthPrompt((p) => {
        setAuthPromptSource("pty");
        setAuthPrompt(p);
      }),
      sessionApi.onHostKeyPrompt((p) => {
        setHostKeySource("pty");
        setHostKeyPrompt(p);
      }),
      sftpApi.onSftpAuthPrompt((p) => {
        setAuthPromptSource("sftp");
        setAuthPrompt(p);
      }),
      sftpApi.onSftpHostKeyPrompt((p) => {
        setHostKeySource("sftp");
        setHostKeyPrompt(p);
      }),
    ]).then((fns) => {
      if (!active) {
        fns.forEach((fn) => fn());
        return;
      }
      unlisteners.push(...fns);
    });

    return () => {
      active = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const connectWithConflictCheck = useCallback(
    async (host: HostProfileSummaryDto) => {
      if (host.active_port_forwards_count > 0) {
        try {
          const probe = await hostsApi.portForwardProbe(host.id);
          const conflicts = probe.filter((p) => p.status === "CONFLICT_EXTERNAL");
          if (conflicts.length > 0) {
            setPendingConflictHost(host);
            setPortConflicts(conflicts);
            return;
          }
        } catch {
          // Proceed if probe fails
        }
      }
      onSpawnHostTab(host, "AUTO_SHARE_OR_SKIP");
    },
    [onSpawnHostTab]
  );

  const skipPortConflictsAndConnect = useCallback(() => {
    const host = pendingConflictHost;
    setPortConflicts([]);
    setPendingConflictHost(null);
    if (host) onSpawnHostTab(host, "AUTO_SHARE_OR_SKIP");
  }, [onSpawnHostTab, pendingConflictHost]);

  const abortPortConflicts = useCallback(() => {
    setPortConflicts([]);
    setPendingConflictHost(null);
  }, []);

  return {
    authPrompt,
    setAuthPrompt,
    authPromptSource,
    hostKeyPrompt,
    setHostKeyPrompt,
    hostKeySource,
    portConflicts,
    connectWithConflictCheck,
    skipPortConflictsAndConnect,
    abortPortConflicts,
  };
}
