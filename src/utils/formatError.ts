import { TranslationParams } from "../i18n";

type TranslateFn = (key: string, params?: TranslationParams) => string;

interface AppErrorLike {
  code?: unknown;
  message?: unknown;
}

const PREFIX_MAP: Array<[RegExp, string]> = [
  [/^Validation error:\s*/i, "errors.prefix_validation"],
  [/^Resource not found:\s*/i, "errors.prefix_not_found"],
  [/^Database error:\s*/i, "errors.prefix_database"],
  [/^PTY error:\s*/i, "errors.prefix_pty"],
  [/^OS\/Process error:\s*/i, "errors.prefix_os"],
  [/^I\/O error:\s*/i, "errors.prefix_io"],
  [/^Internal error:\s*/i, "errors.prefix_internal"],
];

interface ErrorMatcher {
  pattern: RegExp;
  key: string;
  params?: (match: RegExpMatchArray) => TranslationParams;
}

const KNOWN_ERROR_MATCHERS: ErrorMatcher[] = [
  {
    pattern: /^Key name cannot be empty$/i,
    key: "errors.key_name_empty",
  },
  {
    pattern: /^Key name cannot exceed (\d+) characters$/i,
    key: "errors.key_name_too_long",
    params: (m) => ({ max: m[1] }),
  },
  {
    pattern: /^Key name contains invalid control characters$/i,
    key: "errors.key_name_invalid_chars",
  },
  {
    pattern: /^Key name "(.+?)" already exists\./i,
    key: "errors.key_name_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Private key path cannot be empty$/i,
    key: "errors.key_path_empty",
  },
  {
    pattern: /^Key file not found:\s*(.+)$/i,
    key: "errors.key_file_not_found",
    params: (m) => ({ path: m[1] }),
  },
  {
    pattern: /^This key file is already in Vault as "(.+?)"\.?$/i,
    key: "errors.key_path_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern:
      /^This SSH key already exists in Vault as "(.+?)" \(duplicate key fingerprint\)\.?$/i,
    key: "errors.key_fingerprint_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^(?:SSH Key not found|SSH key not found in Vault):\s*(.+)$/i,
    key: "errors.key_not_found",
    params: (m) => ({ id: m[1] }),
  },
  {
    pattern: /^Unsupported key_type:\s*(.+)$/i,
    key: "errors.key_unsupported_type",
    params: (m) => ({ type: m[1] }),
  },
  {
    pattern:
      /^(?:SSH key generation failed|Key generation task failed|Public key formatting failed|Private key encryption failed|Private key serialization failed):\s*(.+)$/i,
    key: "errors.key_generation_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Key import task failed:\s*(.+)$/i,
    key: "errors.key_import_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern:
      /^(?:SSH Key authentication requires selecting a key or providing a Key Path\.|SSH_KEY authentication requires a valid private_key_path)$/i,
    key: "errors.key_binding_required",
  },
  {
    pattern: /^Alias cannot be empty$/i,
    key: "errors.host_alias_empty",
  },
  {
    pattern: /^Host(?:\/IP)? cannot be empty$/i,
    key: "errors.host_host_empty",
  },
  {
    pattern: /^Port must be between 1 and 65535$/i,
    key: "errors.host_port_range",
  },
  {
    pattern: /^Username cannot be empty$/i,
    key: "errors.host_username_empty",
  },
  {
    pattern: /^(?:Invalid auth_method '(.+?)'|Unsupported auth_method:\s*(.+))$/i,
    key: "errors.host_invalid_auth",
    params: (m) => ({ method: m[1] || m[2] || "" }),
  },
  {
    pattern: /^Missing host id for update$/i,
    key: "errors.host_missing_id",
  },
  {
    pattern: /^Host profile not found:\s*(.+)$/i,
    key: "errors.host_not_found",
    params: (m) => ({ id: m[1] }),
  },
  {
    pattern: /^Port forward rule not found:\s*(.+)$/i,
    key: "errors.port_forward_not_found",
    params: (m) => ({ id: m[1] }),
  },
  {
    pattern: /^Tab connection is already in progress$/i,
    key: "errors.session_connect_in_progress",
  },
  {
    pattern: /^Port (.+?):(\d+) is already in use by (.+?) \(PID (\d+)\)$/i,
    key: "errors.session_port_conflict",
    params: (m) => ({
      address: m[1],
      port: m[2],
      process: m[3],
      pid: m[4],
    }),
  },
  {
    pattern: /^Failed to open Windows ConPTY:\s*(.+)$/i,
    key: "errors.session_conpty_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to spawn process:\s*(.+)$/i,
    key: "errors.session_spawn_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Failed to resize ConPTY:\s*(.+)$/i,
    key: "errors.session_resize_failed",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /^Elevated tabs are only supported on Windows$/i,
    key: "errors.session_elevated_windows_only",
  },
  {
    pattern: /^Active PTY session not found for tab\s+.+$/i,
    key: "errors.session_not_found",
  },
  {
    pattern: /^No host found for tab\s+.+$/i,
    key: "errors.session_no_host",
  },
  {
    pattern: /^Cannot reconnect tab\s+.+?:\s*no associated host_id found$/i,
    key: "errors.session_reconnect_missing_host",
  },
  {
    pattern: /^Process exited with code (-?\d+)$/i,
    key: "errors.session_exited_code",
    params: (m) => ({ code: m[1] }),
  },
  {
    pattern: /(permission denied\s*\([^)]*\).*)$/i,
    key: "errors.session_auth_denied",
    params: (m) => ({ detail: m[1] }),
  },
  {
    pattern: /UAC_CANCELLED/i,
    key: "errors.session_uac_cancelled",
  },
  {
    pattern:
      /^(?:Failed to (?:open elevated ConPTY|spawn elevated powershell\.exe|verify elevated worker handshake|open named pipe|resolve executable path)|Elevation launched without process handle|Elevation thread panicked|Invalid elevated worker handshake).*$/i,
    key: "errors.session_elevated_failed",
    params: (m) => ({ detail: m[0] }),
  },
  {
    pattern: /^Unsupported host key action:\s*(.+)$/i,
    key: "errors.hostkey_unsupported_action",
    params: (m) => ({ action: m[1] }),
  },
  {
    pattern: /^Group name cannot be empty$/i,
    key: "errors.group_name_empty",
  },
  {
    pattern: /^Group name cannot exceed (\d+) characters$/i,
    key: "errors.group_name_too_long",
    params: (m) => ({ max: m[1] }),
  },
  {
    pattern: /^Group name contains invalid control characters$/i,
    key: "errors.group_name_invalid_chars",
  },
  {
    pattern: /^Group name "(.+?)" already exists$/i,
    key: "errors.group_name_duplicate",
    params: (m) => ({ name: m[1] }),
  },
  {
    pattern: /^Cannot delete Default group$/i,
    key: "errors.group_delete_default",
  },
];

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
  const raw = extractRawErrorMessage(err);
  if (!raw) return t("errors.unknown");

  let stripped = raw;
  let matchedPrefixKey: string | null = null;
  for (const [regex, prefixKey] of PREFIX_MAP) {
    if (regex.test(stripped)) {
      stripped = stripped.replace(regex, "").trim();
      matchedPrefixKey = prefixKey;
      break;
    }
  }

  for (const matcher of KNOWN_ERROR_MATCHERS) {
    const match = stripped.match(matcher.pattern);
    if (match) {
      return t(matcher.key, matcher.params ? matcher.params(match) : undefined);
    }
  }

  if (matchedPrefixKey && stripped) {
    return t(matchedPrefixKey, { detail: stripped });
  }
  return raw;
}
