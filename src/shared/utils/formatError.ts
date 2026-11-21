import type { TranslationParams } from "@/shared/i18n";

type TranslateFn = (key: string, params?: TranslationParams) => string;

interface AppErrorLike {
  code?: unknown;
  message?: unknown;
}

/** Redundant wrapper prefixes (both backend categories and protocol handshake noises) */
const WRAPPER_PREFIX_RE =
  /^(?:(?:Validation error|Resource not found|Database error|PTY error|SFTP error|OS\/Process error|I\/O error|Internal error|SSH connect(?:ion)? failed|banner exchange|kex_exchange_identification|ssh|Failed to connect|Connection failed):\s*)+/i;

interface ErrorMatcher {
  pattern: RegExp;
  key: string;
  params?: (match: RegExpMatchArray) => TranslationParams;
}

/** App UI & CRUD validation matchers; system/protocol/OS/shell errors pass through clean. */
const KNOWN_ERROR_MATCHERS: ErrorMatcher[] = [
  { pattern: /^Key name cannot be empty$/i, key: "errors.key_name_empty" },
  {
    pattern: /^Key name cannot exceed (\d+) characters$/i,
    key: "errors.key_name_too_long",
    params: (m) => ({ max: m[1] }),
  },
  { pattern: /^Key name contains invalid control characters$/i, key: "errors.key_name_invalid_chars" },
  { pattern: /^Key name "(.+?)" already exists\./i, key: "errors.key_name_duplicate", params: (m) => ({ name: m[1] }) },
  { pattern: /^Private key path cannot be empty$/i, key: "errors.key_path_empty" },
  { pattern: /^Key file not found:\s*(.+)$/i, key: "errors.key_file_not_found", params: (m) => ({ path: m[1] }) },
  {
    pattern: /^This key file is already in Vault as "(.+?)"\.?$/i,
    key: "errors.key_path_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^This SSH key already exists in Vault as "(.+?)" \(duplicate key fingerprint\)\.?$/i,
    key: "errors.key_fingerprint_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  { pattern: /^(?:SSH Key not found|SSH key not found in Vault):\s*(.+)$/i, key: "errors.key_not_found", params: (m) => ({ id: m[1] }) },
  { pattern: /^Unsupported key_type:\s*(.+)$/i, key: "errors.key_unsupported_type", params: (m) => ({ type: m[1] }) },
  {
    pattern: /^(?:SSH key generation failed|Key generation task failed|Public key formatting failed|Private key encryption failed|Private key serialization failed):\s*(.+)$/i,
    key: "errors.key_generation_failed",
    params: (m) => ({ detail: m[1] }),
  },
  { pattern: /^Key import task failed:\s*(.+)$/i, key: "errors.key_import_failed", params: (m) => ({ detail: m[1] }) },
  {
    pattern: /^(?:SSH Key authentication requires selecting a key or providing a Key Path\.|SSH_KEY authentication requires a valid private_key_path)$/i,
    key: "errors.key_binding_required",
  },
  {
    pattern: /^(?:Password is required|Password cannot be empty when password mode is SAVED)$/i,
    key: "errors.host_password_empty",
  },
  { pattern: /^Alias cannot be empty$/i, key: "errors.host_alias_empty" },
  { pattern: /^Host(?:\/IP)? cannot be empty$/i, key: "errors.host_host_empty" },
  {
    pattern: /^Host cannot start with a hyphen '-':\s*'(.+?)'$/i,
    key: "errors.host_host_invalid_hyphen",
  },
  {
    pattern: /^Host contains invalid whitespace or control characters:\s*'(.+?)'$/i,
    key: "errors.host_host_invalid_chars",
  },
  { pattern: /^Port must be between 1 and 65535$/i, key: "errors.host_port_range" },
  { pattern: /^Username cannot be empty$/i, key: "errors.host_username_empty" },
  {
    pattern: /^Username cannot start with a hyphen '-':\s*'(.+?)'$/i,
    key: "errors.host_username_invalid_hyphen",
  },
  {
    pattern: /^Username contains invalid whitespace or control characters:\s*'(.+?)'$/i,
    key: "errors.host_username_invalid_chars",
  },
  {
    pattern: /^(?:Invalid auth_method '(.+?)'|Unsupported auth_method:\s*(.+))$/i,
    key: "errors.host_invalid_auth",
    params: (m) => ({ method: m[1] || m[2] || "" }),
  },
  { pattern: /^Missing host id for update$/i, key: "errors.host_missing_id" },
  { pattern: /^Host profile not found:\s*(.+)$/i, key: "errors.host_not_found", params: (m) => ({ id: m[1] }) },
  { pattern: /^Port forward rule not found:\s*(.+)$/i, key: "errors.port_forward_not_found", params: (m) => ({ id: m[1] }) },
  {
    pattern: /^Duplicate local listening port (\d+) between rules '(.+?)' and '(.+?)'$/i,
    key: "errors.forward_duplicate_local_port",
    params: (m) => ({ port: m[1] }),
  },
  {
    pattern: /^Duplicate remote listening port (\d+) between rules '(.+?)' and '(.+?)'$/i,
    key: "errors.forward_duplicate_remote_port",
    params: (m) => ({ port: m[1] }),
  },
  {
    pattern: /^Bind address (?:cannot start with hyphen|contains invalid characters):/i,
    key: "errors.forward_bind_address_invalid",
  },
  {
    pattern: /^Target host (?:cannot start with hyphen|contains invalid characters):/i,
    key: "errors.forward_target_host_invalid",
  },
  {
    pattern: /^(?:LOCAL|REMOTE) port forward requires a target host$/i,
    key: "errors.forward_target_required",
  },
  {
    pattern: /^(?:LOCAL|REMOTE) port forward requires a valid target port$/i,
    key: "errors.forward_port_range",
  },
  {
    pattern: /^Bind port must be between 1 and 65535$/i,
    key: "errors.forward_port_range",
  },
  { pattern: /UAC_CANCELLED/i, key: "errors.session_uac_cancelled" },
  {
    pattern: /^Executable '(.+?)' is not an authorized interactive shell for elevated execution$/i,
    key: "errors.session_shell_unauthorized",
    params: (m) => ({ exe: m[1] }),
  },
  {
    pattern: /^Argument '(.+?)' is not permitted for elevated \w+ shell \(non-interactive execution blocked\)$/i,
    key: "errors.session_shell_arg_disallowed",
    params: (m) => ({ arg: m[1] }),
  },
  { pattern: /^Elevated shell executable cannot be empty$/i, key: "errors.session_shell_exe_empty" },
  {
    pattern: /^Shell profile name and executable cannot be empty$/i,
    key: "errors.shell_profile_empty",
  },
  { pattern: /^Path to delete cannot be empty$/i, key: "errors.local_delete_empty" },
  {
    pattern: /^Deleting drive or root path is strictly prohibited:\s*'(.+?)'$/i,
    key: "errors.local_delete_root",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Deleting protected system path is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_delete_protected",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Deleting the user profile root directory is strictly prohibited$/i,
    key: "errors.local_delete_user_root",
  },
  {
    pattern: /^Deleting application data directory is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_delete_app_data",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Cannot rename root path:\s*(.+)$/i,
    key: "errors.local_cannot_rename_root",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Target already exists:\s*(.+)$/i,
    key: "errors.local_target_already_exists",
    params: (m) => ({ path: m[1] }),
  },
  { pattern: /^Group name cannot be empty$/i, key: "errors.group_name_empty" },
  {
    pattern: /^Group name cannot exceed (\d+) characters$/i,
    key: "errors.group_name_too_long",
    params: (m) => ({ max: m[1] }),
  },
  { pattern: /^Group name contains invalid control characters$/i, key: "errors.group_name_invalid_chars" },
  { pattern: /^Group name "(.+?)" already exists$/i, key: "errors.group_name_duplicate", params: (m) => ({ name: m[1] }) },
  { pattern: /^Cannot delete Default group$/i, key: "errors.group_delete_default" },
  {
    pattern: /^Destination file was deleted or corrupted while paused(?:\s*\(.+\))?$/i,
    key: "errors.sftp_dest_corrupted_paused",
  },
  {
    pattern: /^Destination file was deleted or corrupted during transfer$/i,
    key: "errors.sftp_dest_corrupted_transfer",
  },
  {
    pattern: /^Remote destination file was deleted or corrupted while paused(?:\s*\(.+\))?$/i,
    key: "errors.sftp_remote_dest_corrupted_paused",
  },
  {
    pattern: /^Source file was truncated while paused(?:\s*\(.+\))?$/i,
    key: "errors.sftp_source_truncated_paused",
  },
  {
    pattern: /^Source file was deleted or corrupted during transfer$/i,
    key: "errors.sftp_source_corrupted_transfer",
  },
  {
    pattern: /^(?:(?:Failed to \w+.*?|Stat '.*?'|Read '.*?'|Open '.*?'):\s*)?Permission denied$/i,
    key: "errors.sftp_permission_denied",
  },
  {
    pattern: /^(?:(?:Failed to \w+.*?|Stat '.*?'|Read '.*?'|Open '.*?'):\s*)?No such file(?: or directory)?$/i,
    key: "errors.sftp_not_found",
  },
  {
    pattern: /^(?:Failed to \w+.*?:\s*)?File already exists$/i,
    key: "errors.sftp_already_exists",
  },
  {
    pattern: /^Destination '(.+?)' already exists as a directory$/i,
    key: "errors.sftp_dest_exists_dir",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^(?:SSH )?connection timed out$/i,
    key: "errors.sftp_timeout",
  },
  {
    pattern: /^Connection cancelled$/i,
    key: "errors.sftp_conn_cancelled",
  },
  {
    pattern: /^Authentication cancelled$/i,
    key: "errors.sftp_auth_cancelled",
  },
  {
    pattern: /^Failed to initialize SFTP protocol:\s*(.+)$/i,
    key: "errors.sftp_init_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^(?:SFTP session not found for|No connecting SFTP session for)\s*(.+)$/i,
    key: "errors.sftp_session_not_found",
  },
  {
    pattern: /^SFTP cannot connect to the local shell/i,
    key: "errors.sftp_local_shell_unsupported",
  },
  {
    pattern: /^SFTP session is (?:already authenticated|already connected)$/i,
    key: "errors.sftp_already_connected",
  },
  {
    pattern: /^SFTP session is still connecting$/i,
    key: "errors.sftp_still_connecting",
  },
  {
    pattern: /^(?:Connection lost|Connection closed|Broken pipe)$/i,
    key: "errors.sftp_connection_lost",
  },
  {
    pattern: /^Transfer job not found:\s*(.+)$/i,
    key: "errors.sftp_job_not_found",
    params: (m) => ({ id: m[1] }),
  },
  {
    pattern: /^Conflict prompt not found:\s*(.+)$/i,
    key: "errors.sftp_conflict_prompt_not_found",
    params: (m) => ({ id: m[1] }),
  },
  {
    pattern: /^Cannot rename root(?: path)?(?::\s*.*|\s*'\/')?$/i,
    key: "errors.sftp_cannot_rename_root",
  },
  {
    pattern: /^Refusing to delete '\/'$/i,
    key: "errors.sftp_refuse_delete_root",
  },
  {
    pattern: /^Cannot upload root directory$/i,
    key: "errors.sftp_cannot_upload_root",
  },
  {
    pattern: /^Cannot download root '\/'$/i,
    key: "errors.sftp_cannot_download_root",
  },
  {
    pattern: /^Cannot rename file at filesystem root$/i,
    key: "errors.sftp_cannot_rename_fs_root",
  },
  {
    pattern: /^Cannot download symlink pointing to a directory directly as a file$/i,
    key: "errors.sftp_symlink_dir_file",
  },
  {
    pattern: /^(?:Entry|Target) name cannot be empty$/i,
    key: "errors.sftp_entry_name_empty",
  },
  {
    pattern: /^Invalid entry name:\s*'(.+?)'$/i,
    key: "errors.sftp_entry_name_invalid",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Entry name cannot contain path separators or null bytes:\s*'(.+?)'$/i,
    key: "errors.sftp_entry_name_separators",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Windows filename cannot end with a space or dot:\s*'(.+?)'$/i,
    key: "errors.sftp_win_name_trailing",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Filename contains characters disallowed on Windows:\s*'(.+?)'$/i,
    key: "errors.sftp_win_disallowed_chars",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Filename uses a reserved Windows device name:\s*'(.+?)'$/i,
    key: "errors.sftp_win_reserved",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Seek failed:\s*(.+)$/i,
    key: "errors.sftp_seek_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Broken symlink '(.+?)':\s*(.+)$/i,
    key: "errors.sftp_broken_symlink",
    params: (m) => ({ path: m[1], detail: m[2] }),
  },
  {
    pattern: /^Failed to list remote directory:\s*(.+)$/i,
    key: "errors.sftp_failed_list",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to create remote directory:\s*(.+)$/i,
    key: "errors.sftp_failed_mkdir",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to rename remote entry:\s*(.+)$/i,
    key: "errors.sftp_failed_rename",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to update permissions:\s*(.+)$/i,
    key: "errors.sftp_failed_chmod",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to remove remote (?:file|directory|child):\s*(.+)$/i,
    key: "errors.sftp_failed_delete",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to (?:stat remote path|inspect remote target):\s*(.+)$/i,
    key: "errors.sftp_failed_stat",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Invalid POSIX mode:/i,
    key: "errors.sftp_invalid_posix_mode",
  },
  {
    pattern: /^Failed to open (?:Windows )?clipboard$/i,
    key: "errors.clipboard_failed",
  },
  {
    pattern: /^Cannot register debug executable to context menu/i,
    key: "errors.context_menu_debug_blocked",
  },
  {
    pattern: /^Context menu registration is only supported on Windows$/i,
    key: "errors.context_menu_windows_only",
  },
];

export function stripErrorPrefixes(raw: string): string {
  let cleaned = dedupeErrorText(raw);
  while (WRAPPER_PREFIX_RE.test(cleaned)) {
    cleaned = cleaned.replace(WRAPPER_PREFIX_RE, "").trim();
  }
  return dedupeErrorText(cleaned);
}

export function dedupeErrorText(raw: string): string {
  const parts: string[] = [];
  for (const seg of raw.split(/:\s+/)) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const prev = parts[parts.length - 1];
    if (prev && prev.toLowerCase() === trimmed.toLowerCase()) continue;
    parts.push(trimmed);
  }
  return parts.join(": ");
}

export function extractRawErrorMessage(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err instanceof Error) return err.message.trim();
  if (typeof err === "object" && err !== null) {
    const obj = err as AppErrorLike;
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message.trim();
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "";
    }
  }
  if (err == null) return "";
  return String(err).trim();
}

export function formatLocalizedError(err: unknown, t: TranslateFn): string {
  const raw = dedupeErrorText(extractRawErrorMessage(err));
  if (!raw) return t("errors.unknown");

  const stripped = stripErrorPrefixes(raw);

  for (const matcher of KNOWN_ERROR_MATCHERS) {
    const match = stripped.match(matcher.pattern);
    if (match) {
      return t(matcher.key, matcher.params ? matcher.params(match) : undefined);
    }
  }
  return stripped;
}
