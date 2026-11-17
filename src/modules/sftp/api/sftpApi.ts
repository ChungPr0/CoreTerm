import { invoke, listenEvent, type UnlistenFn } from "@/shared/api/tauriClient";
import type {
  SftpAuthPromptEventDto,
  SftpConflictPolicy,
  SftpConnectAckDto,
  SftpHostKeyPromptEventDto,
  SftpListDirResultDto,
  SftpStatusEventDto,
  SftpTransferConflictEventDto,
  SftpTransferJobDto,
} from "../types";

export const sftpApi = {
  sftpConnect(tabId: string, hostId: string): Promise<SftpConnectAckDto> {
    return invoke<SftpConnectAckDto>("sftp_connect", {
      tab_id: tabId,
      host_id: hostId,
    });
  },

  sftpDisconnect(tabId: string): Promise<void> {
    return invoke<void>("sftp_disconnect", { tab_id: tabId });
  },

  sftpSubmitSecret(
    tabId: string,
    secret: string,
    saveToVault: boolean,
    autoReconnect?: boolean
  ): Promise<void> {
    return invoke<void>("sftp_submit_secret", {
      tab_id: tabId,
      secret,
      save_to_vault: saveToVault,
      auto_reconnect: autoReconnect,
    });
  },

  sftpSubmitHostKey(
    tabId: string,
    action: "ACCEPT" | "REJECT" | "REMOVE_OLD_AND_ACCEPT"
  ): Promise<void> {
    return invoke<void>("sftp_submit_host_key", {
      tab_id: tabId,
      action,
    });
  },

  sftpListDir(tabId: string, path: string): Promise<SftpListDirResultDto> {
    return invoke<SftpListDirResultDto>("sftp_list_dir", {
      tab_id: tabId,
      path,
    });
  },

  sftpCreateDir(
    tabId: string,
    parentDir: string,
    name: string
  ): Promise<string> {
    return invoke<string>("sftp_create_dir", {
      tab_id: tabId,
      parent_dir: parentDir,
      name,
    });
  },

  sftpRename(
    tabId: string,
    oldPath: string,
    newName: string
  ): Promise<string> {
    return invoke<string>("sftp_rename", {
      tab_id: tabId,
      old_path: oldPath,
      new_name: newName,
    });
  },

  sftpDelete(tabId: string, paths: string[]): Promise<void> {
    return invoke<void>("sftp_delete", { tab_id: tabId, paths });
  },

  sftpChmod(tabId: string, path: string, mode: number): Promise<void> {
    return invoke<void>("sftp_chmod", { tab_id: tabId, path, mode });
  },

  sftpUpload(
    tabId: string,
    localPaths: string[],
    remoteDir: string,
    conflictPolicy: SftpConflictPolicy
  ): Promise<SftpTransferJobDto[]> {
    return invoke<SftpTransferJobDto[]>("sftp_upload", {
      tab_id: tabId,
      local_paths: localPaths,
      remote_dir: remoteDir,
      conflict_policy: conflictPolicy,
    });
  },

  sftpDownload(
    tabId: string,
    remotePaths: string[],
    localDir: string,
    conflictPolicy: SftpConflictPolicy
  ): Promise<SftpTransferJobDto[]> {
    return invoke<SftpTransferJobDto[]>("sftp_download", {
      tab_id: tabId,
      remote_paths: remotePaths,
      local_dir: localDir,
      conflict_policy: conflictPolicy,
    });
  },

  sftpPauseTransfer(tabId: string, jobId: string): Promise<void> {
    return invoke<void>("sftp_pause_transfer", {
      tab_id: tabId,
      job_id: jobId,
    });
  },

  sftpResumeTransfer(tabId: string, jobId: string): Promise<void> {
    return invoke<void>("sftp_resume_transfer", {
      tab_id: tabId,
      job_id: jobId,
    });
  },

  sftpCancelTransfer(tabId: string, jobId: string): Promise<void> {
    return invoke<void>("sftp_cancel_transfer", {
      tab_id: tabId,
      job_id: jobId,
    });
  },

  sftpResolveConflict(
    tabId: string,
    conflictId: string,
    action: "OVERWRITE" | "SKIP" | "RENAME" | "RESUME",
    applyToAll: boolean
  ): Promise<void> {
    return invoke<void>("sftp_resolve_conflict", {
      tab_id: tabId,
      conflict_id: conflictId,
      action,
      apply_to_all: applyToAll,
    });
  },

  sftpListTransfers(tabId: string): Promise<SftpTransferJobDto[]> {
    return invoke<SftpTransferJobDto[]>("sftp_list_transfers", {
      tab_id: tabId,
    });
  },

  sftpClearFinishedTransfers(tabId: string): Promise<void> {
    return invoke<void>("sftp_clear_finished_transfers", { tab_id: tabId });
  },

  onSftpStatus(
    handler: (payload: SftpStatusEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("sftp:status", handler);
  },

  onSftpAuthPrompt(
    handler: (payload: SftpAuthPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("sftp:auth_prompt", handler);
  },

  onSftpHostKeyPrompt(
    handler: (payload: SftpHostKeyPromptEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("sftp:host_key_prompt", handler);
  },

  onSftpTransferProgress(
    handler: (payload: SftpTransferJobDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("sftp:transfer_progress", handler);
  },

  onSftpTransferConflict(
    handler: (payload: SftpTransferConflictEventDto) => void
  ): Promise<UnlistenFn> {
    return listenEvent("sftp:transfer_conflict", handler);
  },
};
