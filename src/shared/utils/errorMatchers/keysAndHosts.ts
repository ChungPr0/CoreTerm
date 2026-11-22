import type { ErrorMatcher } from "./types";

export const KEYS_AND_HOSTS_ERROR_MATCHERS: ErrorMatcher[] = [
  { pattern: /^Key name cannot be empty$/i, key: "errors.key_name_empty" },
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
  { pattern: /^Private key path cannot be empty$/i, key: "errors.key_path_empty" },
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
    pattern: /^This SSH key already exists in Vault as "(.+?)" \(duplicate key fingerprint\)\.?$/i,
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
  { pattern: /^Group name cannot be empty$/i, key: "errors.group_name_empty" },
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
  { pattern: /^Cannot delete Default group$/i, key: "errors.group_delete_default" },
];
