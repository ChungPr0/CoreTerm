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
  { pattern: /^Group name cannot be empty$/i, key: "errors.group_name_empty" },
  {
    pattern: /^Group name cannot exceed (\d+) characters$/i,
    key: "errors.group_name_too_long",
    params: (m) => ({ max: m[1] }),
  },
  { pattern: /^Group name contains invalid control characters$/i, key: "errors.group_name_invalid_chars" },
  { pattern: /^Group name "(.+?)" already exists$/i, key: "errors.group_name_duplicate", params: (m) => ({ name: m[1] }) },
  { pattern: /^Cannot delete Default group$/i, key: "errors.group_delete_default" },
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
