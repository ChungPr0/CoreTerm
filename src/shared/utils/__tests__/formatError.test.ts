import { describe, expect, it } from "vitest";
import en from "@/shared/i18n/locales/en.json";
import vi from "@/shared/i18n/locales/vi.json";
import {
  dedupeErrorText,
  extractRawErrorMessage,
  formatLocalizedError,
  stripErrorPrefixes,
} from "@/shared/utils/formatError";

const lookup = (dict: Record<string, unknown>, key: string, params?: Record<string, string | number>) => {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
  }
  if (typeof cur !== "string") return key;
  return params ? cur.replace(/\{\{(\w+)\}\}/g, (_, tok) => String(params[tok] ?? "")) : cur;
};

const viT = (key: string, params?: Record<string, string | number>) => lookup(vi, key, params);
const enT = (key: string, params?: Record<string, string | number>) => lookup(en, key, params);
const mockT = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("formatError utils", () => {
  it("dedupes repeated adjacent colon segments", () => {
    expect(dedupeErrorText("Permission denied: Permission denied")).toBe("Permission denied");
    expect(dedupeErrorText("IO error: io error: Disk full")).toBe("IO error: Disk full");
  });

  it("extracts messages from strings, Errors and DTOs", () => {
    expect(extractRawErrorMessage("  failed  ")).toBe("failed");
    expect(extractRawErrorMessage(new Error("boom"))).toBe("boom");
    expect(extractRawErrorMessage({ code: "SFTP_ERROR", message: "  denied " })).toBe("denied");
    expect(extractRawErrorMessage(null)).toBe("");
  });

  it("maps known errors and falls back to unknown key", () => {
    expect(formatLocalizedError("", mockT)).toBe("errors.unknown");
    expect(formatLocalizedError("Cannot delete Default group", mockT)).toBe(
      "errors.group_delete_default"
    );
  });

  it("localizes app CRUD validation errors and internal UAC cancel in vi and en", () => {
    const cases = [
      ["Validation error: Key name cannot be empty", "Tên khóa", "empty"],
      ["Validation error: Host/IP cannot be empty", "Host", "Host"],
      ["Cannot delete Default group", "nhóm Default", "Default"],
      ["PTY error: UAC_CANCELLED", "Administrator", "Administrator"],
      ["Validation error: Password is required", "Mật khẩu", "Password"],
    ] as const;

    for (const [raw, viSubstr, enSubstr] of cases) {
      const viMsg = formatLocalizedError(raw, viT);
      const enMsg = formatLocalizedError(raw, enT);
      expect(viMsg).not.toMatch(/^errors\./);
      expect(enMsg).not.toMatch(/^errors\./);
      expect(viMsg).toContain(viSubstr);
      expect(enMsg).toContain(enSubstr);
    }
  });

  it("strips redundant prefixes before colons and displays clean system errors", () => {
    const systemErrors = [
      ["banner exchange: Connection to UNKNOWN port -1: Connection refused", "Connection to UNKNOWN port -1: Connection refused"],
      [
        "SFTP error: SSH connect failed: No connection could be made because the target machine actively refused it. (os error 10061)",
        "No connection could be made because the target machine actively refused it. (os error 10061)",
      ],
      ["SFTP error: Permission denied: Permission denied", "Permission denied"],
      ["PTY error: Failed to open Windows ConPTY: access denied", "Failed to open Windows ConPTY: access denied"],
      ["SFTP error: SSH connect failed: Connection refused", "Connection refused"],
      ["Validation error: Entry name cannot be empty", "Entry name cannot be empty"],
      ["Resource not found: Transfer job not found: job-42", "Transfer job not found: job-42"],
    ] as const;

    for (const [raw, expected] of systemErrors) {
      expect(formatLocalizedError(raw, viT)).toBe(expected);
      expect(formatLocalizedError(raw, enT)).toBe(expected);
      expect(stripErrorPrefixes(raw)).toBe(expected);
    }
  });
});
