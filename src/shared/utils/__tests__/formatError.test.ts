import { describe, expect, it } from "vitest";
import { dedupeErrorText, extractRawErrorMessage, formatLocalizedError } from "@/shared/utils/formatError";

const mockT = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe("formatError utils", () => {
  it("dedupes repeated adjacent colon segments", () => {
    expect(dedupeErrorText("SFTP error: Permission denied: Permission denied")).toBe(
      "SFTP error: Permission denied"
    );
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
});
