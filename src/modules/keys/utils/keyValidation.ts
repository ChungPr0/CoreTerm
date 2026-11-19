export const MAX_KEY_NAME_LEN = 64;

export function normalizePathInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export type KeyValidationResult =
  | { ok: true; name: string; sourcePath?: string }
  | { ok: false; errorKey: string; detail?: string };

export function validateKeyForm(
  mode: "generate" | "import",
  name: string,
  sourcePath: string,
  existingKeys: Array<{ name: string; private_key_path: string }>
): KeyValidationResult {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { ok: false, errorKey: "vault.name_required" };
  }
  if (trimmedName.length > MAX_KEY_NAME_LEN) {
    return { ok: false, errorKey: "vault.name_too_long" };
  }
  const dupName = existingKeys.some(
    (k) => k.name.trim().toLowerCase() === trimmedName.toLowerCase()
  );
  if (dupName) {
    return { ok: false, errorKey: "vault.name_duplicate" };
  }

  if (mode === "import") {
    const cleanSourcePath = normalizePathInput(sourcePath);
    if (!cleanSourcePath) {
      return { ok: false, errorKey: "vault.path_required" };
    }
    const dupPath = existingKeys.find(
      (k) => k.private_key_path.trim().toLowerCase() === cleanSourcePath.toLowerCase()
    );
    if (dupPath) {
      return { ok: false, errorKey: "vault.path_duplicate", detail: dupPath.name };
    }
    return { ok: true, name: trimmedName, sourcePath: cleanSourcePath };
  }

  return { ok: true, name: trimmedName };
}
