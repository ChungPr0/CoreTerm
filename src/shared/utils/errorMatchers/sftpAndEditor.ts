import type { ErrorMatcher } from "./types";

export const SFTP_AND_EDITOR_ERROR_MATCHERS: ErrorMatcher[] = [
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
    pattern:
      /^(?:(?:Failed to \w+.*?|Stat '.*?'|Read '.*?'|Open '.*?'):\s*)?No such file(?: or directory)?$/i,
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
    pattern: /^Destination '(.+?)' already exists$/i,
    key: "errors.sftp_dest_already_exists",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Remote path already exists:\s*(.+)$/i,
    key: "errors.sftp_remote_path_exists",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Directory tree exceeds (?:maximum transfer depth or entry|safety) limit$/i,
    key: "errors.sftp_tree_limit_exceeded",
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
    pattern: /^Key passphrase prompt was cancelled$/i,
    key: "errors.sftp_passphrase_cancelled",
  },
  {
    pattern: /^SSH server rejected the private key$/i,
    key: "errors.sftp_key_rejected",
  },
  {
    pattern: /^Invalid SSH key passphrase after 3 attempts$/i,
    key: "errors.sftp_passphrase_exhausted",
  },
  {
    pattern: /^Authentication failed after 3 attempts$/i,
    key: "errors.sftp_auth_exhausted",
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
    pattern: /^(?:Connection lost|Connection closed)$/i,
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
    pattern: /^Failed to create remote directory: Failure$/i,
    key: "errors.sftp_mkdir_failed_exists",
  },
  {
    pattern: /^Failed to (?:list|read) remote directory:\s*(.+)$/i,
    key: "errors.sftp_failed_list",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to create remote directory:\s*(.+)$/i,
    key: "errors.sftp_failed_mkdir",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to create remote file:\s*(.+)$/i,
    key: "errors.sftp_failed_create_file",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to open remote file for (?:reading|writing):\s*(.+)$/i,
    key: "errors.sftp_failed_open_file",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to read remote file:\s*(.+)$/i,
    key: "errors.sftp_failed_read_file",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to write remote file:\s*(.+)$/i,
    key: "errors.sftp_failed_write_file",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^File exceeds maximum editable size \(2 MB\)$/i,
    key: "errors.editor_file_too_large",
  },
  {
    pattern: /^Binary or non-UTF-8 file cannot be edited$/i,
    key: "errors.editor_binary_unsupported",
  },
  {
    pattern: /^Cannot edit a directory$/i,
    key: "errors.editor_is_directory",
  },
  {
    pattern: /^Only regular files can be opened in the text editor$/i,
    key: "errors.editor_not_regular_file",
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
];
