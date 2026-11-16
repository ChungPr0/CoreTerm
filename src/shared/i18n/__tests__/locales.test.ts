import { describe, expect, it } from "vitest";
import en from "../locales/en.json";
import vi from "../locales/vi.json";

function flattenDict(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenDict(v as Record<string, unknown>, fullKey));
    } else {
      out[fullKey] = String(v ?? "");
    }
  }
  return out;
}

function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

describe("bilingual locales parity", () => {
  const flatVi = flattenDict(vi);
  const flatEn = flattenDict(en);

  it("keeps identical key sets and non-empty strings in vi and en", () => {
    expect(Object.keys(flatVi).sort()).toEqual(Object.keys(flatEn).sort());
    for (const [k, val] of Object.entries(flatVi)) {
      expect(val.trim().length, `empty vi value for ${k}`).toBeGreaterThan(0);
    }
    for (const [k, val] of Object.entries(flatEn)) {
      expect(val.trim().length, `empty en value for ${k}`).toBeGreaterThan(0);
    }
  });

  it("keeps identical template placeholders between vi and en", () => {
    for (const k of Object.keys(flatEn)) {
      expect(extractPlaceholders(flatVi[k]), `placeholder mismatch at ${k}`).toEqual(
        extractPlaceholders(flatEn[k])
      );
    }
  });
});
