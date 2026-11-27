import type { ErrorMatcher } from "./types";

export const SESSION_AND_SYSTEM_ERROR_MATCHERS: ErrorMatcher[] = [
  { pattern: /UAC_CANCELLED/i, key: "errors.session_uac_cancelled" },
  {
    pattern:
      /^Executable '(.+?)' is not an authorized interactive shell for elevated execution$/i,
    key: "errors.session_shell_unauthorized",
    params: (m) => ({ exe: m[1] }),
  },
  {
    pattern:
      /^Argument '(.+?)' is not permitted for elevated \w+ shell \(non-interactive execution blocked\)$/i,
    key: "errors.session_shell_arg_disallowed",
    params: (m) => ({ arg: m[1] }),
  },
  {
    pattern: /^Elevated shell executable cannot be empty$/i,
    key: "errors.session_shell_exe_empty",
  },
  {
    pattern: /^Shell profile name and executable cannot be empty$/i,
    key: "errors.shell_profile_empty",
  },
  { pattern: /^Path to delete cannot be empty$/i, key: "errors.local_delete_empty" },
  { pattern: /^File path cannot be empty$/i, key: "errors.local_file_path_empty" },
  {
    pattern: /^Local (?:directory|path|target directory) (?:not found|does not exist):\s*(.+)$/i,
    key: "errors.local_path_not_found",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern:
      /^(?:The system cannot find the file specified|The system cannot find the path specified|No such file or directory)\.?(?:\s*\(os error \d+\))?$/i,
    key: "errors.sftp_not_found",
  },
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
    pattern: /^(?:Deleting|Writing) the user profile root directory is strictly prohibited$/i,
    key: "errors.local_delete_user_root",
  },
  {
    pattern: /^Deleting application data directory is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_delete_app_data",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^(?:Modifying|Writing) drive or root path is strictly prohibited:\s*'(.+?)'$/i,
    key: "errors.local_modify_root",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^(?:Modifying|Writing) protected system path is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_modify_protected",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^(?:Modifying|Writing) application data directory is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_modify_app_data",
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
  {
    pattern:
      /^Failed to (?:open|clear|allocate|lock|set) (?:Windows |global )?(?:clipboard|memory).*$/i,
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
  {
    pattern: /^Cannot register debug executable to Windows startup/i,
    key: "errors.startup_debug_blocked",
  },
  {
    pattern: /^Cannot register network or UNC executable to Windows startup\.?$/i,
    key: "errors.startup_network_path_blocked",
  },
  {
    pattern: /^Windows startup registration is only supported on Windows$/i,
    key: "errors.startup_windows_only",
  },
  {
    pattern: /^In-app update (?:download|installation) is only supported for installed builds\.?$/i,
    key: "errors.updater_installed_only",
  },
  {
    pattern: /^No (?:pending update available to download|staged update installer found)\.?$/i,
    key: "errors.updater_no_pending",
  },
  {
    pattern: /^Update installer package or checksum is unavailable for this release\.?$/i,
    key: "errors.updater_package_unavailable",
  },
  {
    pattern: /^Update download is already in progress\.?$/i,
    key: "errors.updater_already_downloading",
  },
  {
    pattern: /^Update installer exceeds maximum allowed size\.?$/i,
    key: "errors.updater_size_exceeded",
  },
  {
    pattern: /^Update package checksum verification failed\.?$/i,
    key: "errors.updater_checksum_failed",
  },
];
