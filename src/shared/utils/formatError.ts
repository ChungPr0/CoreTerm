import type { TranslationParams } from "@/shared/i18n";
import { KEYS_AND_HOSTS_ERROR_MATCHERS } from "./errorMatchers/keysAndHosts";
import { SESSION_AND_SYSTEM_ERROR_MATCHERS } from "./errorMatchers/sessionAndSystem";
import { SFTP_AND_EDITOR_ERROR_MATCHERS } from "./errorMatchers/sftpAndEditor";
import type { ErrorMatcher } from "./errorMatchers/types";

type TranslateFn = (key: string, params?: TranslationParams) => string;

interface AppErrorLike {
  code?: unknown;
  message?: unknown;
}

/** Redundant wrapper prefixes (both backend categories and protocol handshake noises) */
const WRAPPER_PREFIX_RE =
  /^(?:(?:Validation error|Resource not found|Database error|PTY error|SFTP error|OS\/Process error|I\/O error|Internal error|SSH connect(?:ion)? failed|banner exchange|kex_exchange_identification|ssh|Failed to connect|Connection failed):\s*)+/i;

/** App UI & CRUD validation matchers; system/protocol/OS/shell errors pass through clean. */
export const KNOWN_ERROR_MATCHERS: ErrorMatcher[] = [
  ...KEYS_AND_HOSTS_ERROR_MATCHERS,
  ...SESSION_AND_SYSTEM_ERROR_MATCHERS,
  ...SFTP_AND_EDITOR_ERROR_MATCHERS,
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
