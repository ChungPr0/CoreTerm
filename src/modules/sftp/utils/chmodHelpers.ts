export const MAX_OCTAL_MODE = 0o7777;

export function cleanOctalInput(raw: string): string {
  return raw.replace(/[^0-7]/g, "").slice(0, 4);
}

export function octalToMode(octalText: string): number | null {
  const cleaned = cleanOctalInput(octalText);
  if (!cleaned) return null;
  const parsed = parseInt(cleaned, 8);
  if (Number.isNaN(parsed) || parsed > MAX_OCTAL_MODE) {
    return null;
  }
  return parsed;
}

export function modeToOctal(mode: number): string {
  const masked = mode & MAX_OCTAL_MODE;
  return masked > 0o777
    ? masked.toString(8).padStart(4, "0")
    : masked.toString(8).padStart(3, "0");
}

export function toggleModeBit(currentMode: number, bit: number): number {
  return (currentMode ^ bit) & MAX_OCTAL_MODE;
}

export function isBitSet(mode: number, bit: number): boolean {
  return (mode & bit) === bit;
}
