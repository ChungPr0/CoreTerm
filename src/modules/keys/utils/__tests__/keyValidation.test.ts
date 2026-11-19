import { describe, expect, it } from "vitest";
import { normalizePathInput, validateKeyForm } from "../keyValidation";

const MOCK_KEYS = [
  {
    name: "prod_deploy",
    private_key_path: "C:\\keys\\prod_ed25519",
  },
  {
    name: "staging",
    private_key_path: "/home/user/.ssh/id_rsa",
  },
];

describe("keyValidation", () => {
  it("normalizes path input, trimming whitespace and stripping quotes", () => {
    expect(normalizePathInput(' "C:\\keys\\id_rsa" ')).toBe("C:\\keys\\id_rsa");
    expect(normalizePathInput('"C:\\keys\\key"')).toBe("C:\\keys\\key");
    expect(normalizePathInput("C:\\keys\\key")).toBe("C:\\keys\\key");
    expect(normalizePathInput(' "unterminated ')).toBe('"unterminated');
    expect(normalizePathInput("   ")).toBe("");
  });

  it("validates key name requirements and length limits", () => {
    // Empty name
    expect(validateKeyForm("generate", "", "", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.name_required",
    });
    expect(validateKeyForm("generate", "   ", "", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.name_required",
    });

    // Too long name (> 64 chars)
    const longName = "a".repeat(65);
    expect(validateKeyForm("generate", longName, "", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.name_too_long",
    });

    // Valid 64 chars name
    const maxName = "a".repeat(64);
    expect(validateKeyForm("generate", maxName, "", MOCK_KEYS)).toEqual({
      ok: true,
      name: maxName,
    });
  });

  it("prevents duplicate key names case-insensitively", () => {
    expect(validateKeyForm("generate", "PROD_DEPLOY", "", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.name_duplicate",
    });
    expect(validateKeyForm("import", "  Staging  ", "C:\\some\\key", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.name_duplicate",
    });
  });

  it("validates source path requirements and duplicate path checks on import", () => {
    // Empty path
    expect(validateKeyForm("import", "new_key", "   ", MOCK_KEYS)).toEqual({
      ok: false,
      errorKey: "vault.path_required",
    });

    // Duplicate path (case insensitive)
    expect(
      validateKeyForm("import", "new_key", ' "c:\\keys\\prod_ed25519" ', MOCK_KEYS)
    ).toEqual({
      ok: false,
      errorKey: "vault.path_duplicate",
      detail: "prod_deploy",
    });

    // Valid import
    expect(
      validateKeyForm("import", "new_key", ' "C:\\different\\key.pem" ', MOCK_KEYS)
    ).toEqual({
      ok: true,
      name: "new_key",
      sourcePath: "C:\\different\\key.pem",
    });
  });
});
