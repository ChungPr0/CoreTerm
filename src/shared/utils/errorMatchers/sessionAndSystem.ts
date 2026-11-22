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
    pattern: /^Modifying drive or root path is strictly prohibited:\s*'(.+?)'$/i,
    key: "errors.local_modify_root",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Modifying protected system path is prohibited:\s*'(.+?)'$/i,
    key: "errors.local_modify_protected",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^Modifying application data directory is prohibited:\s*'(.+?)'$/i,
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
];
