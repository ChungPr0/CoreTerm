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

type PromptSource = "pty" | "sftp";

interface QueuedPrompt<T> {
  prompt: T;
  source: PromptSource;
}

type AuthPromptDto = SessionAuthPromptEventDto | SftpAuthPromptEventDto;
type HostKeyPromptDto = SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto;

export function enqueuePrompt<T extends { tab_id: string }>(
  prev: QueuedPrompt<T>[],
  prompt: T,
  source: PromptSource
): QueuedPrompt<T>[] {
  const idx = prev.findIndex((x) => x.prompt.tab_id === prompt.tab_id && x.source === source);
  if (idx >= 0) {
    const next = [...prev];
    next[idx] = { prompt, source };
    return next;
  }
  return [...prev, { prompt, source }];
}

export function pruneQueueByTabs<T extends { tab_id: string }>(
  prev: QueuedPrompt<T>[],
  openTabIds: Set<string>
): QueuedPrompt<T>[] {
  const next = prev.filter((item) => openTabIds.has(item.prompt.tab_id));
  return next.length === prev.length ? prev : next;
}

export function usePtyAuthPrompts(
  onSpawnHostTab: (host: HostProfileSummaryDto, strategy: ConflictStrategy) => void
) {
  const [authQueue, setAuthQueue] = useState<QueuedPrompt<AuthPromptDto>[]>([]);
  const [hostKeyQueue, setHostKeyQueue] = useState<QueuedPrompt<HostKeyPromptDto>[]>([]);
  const [pendingConflictHost, setPendingConflictHost] =
    useState<HostProfileSummaryDto | null>(null);
  const [portConflicts, setPortConflicts] = useState<PortProbeResultDto[]>([]);

  useEffect(() => {
    let active = true;
    const unlisteners: Array<() => void> = [];

    Promise.all([
      sessionApi.onAuthPrompt((p) =>
        setAuthQueue((prev) => enqueuePrompt(prev, p, "pty"))
      ),
      sessionApi.onHostKeyPrompt((p) =>
        setHostKeyQueue((prev) => enqueuePrompt(prev, p, "pty"))
      ),
      sftpApi.onSftpAuthPrompt((p) =>
        setAuthQueue((prev) => enqueuePrompt(prev, p, "sftp"))
      ),
      sftpApi.onSftpHostKeyPrompt((p) =>
        setHostKeyQueue((prev) => enqueuePrompt(prev, p, "sftp"))
      ),
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

  const dismissAuthPrompt = useCallback(() => {
    setAuthQueue((prev) => prev.slice(1));
  }, []);

  const dismissHostKeyPrompt = useCallback(() => {
    setHostKeyQueue((prev) => prev.slice(1));
  }, []);

  const prunePromptsForClosedTabs = useCallback((openTabIds: Set<string>) => {
    setAuthQueue((prev) => pruneQueueByTabs(prev, openTabIds));
    setHostKeyQueue((prev) => pruneQueueByTabs(prev, openTabIds));
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
    authPrompt: authQueue[0]?.prompt ?? null,
    authPromptSource: authQueue[0]?.source ?? "pty",
    hostKeyPrompt: hostKeyQueue[0]?.prompt ?? null,
    hostKeySource: hostKeyQueue[0]?.source ?? "pty",
    dismissAuthPrompt,
    dismissHostKeyPrompt,
    prunePromptsForClosedTabs,
    portConflicts,
    connectWithConflictCheck,
    skipPortConflictsAndConnect,
    abortPortConflicts,
  };
}
