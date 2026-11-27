import { describe, expect, it } from "vitest";
import { setElementInert } from "../focusTrap";

describe("focusTrap utilities", () => {
  it("handles null safely and toggles inert property and attribute", () => {
    expect(() => setElementInert(null, true)).not.toThrow();

    const attrs = new Map<string, string>();
    const fakeEl = {
      inert: false,
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    } as unknown as HTMLElement & { inert: boolean };

    setElementInert(fakeEl, true);
    expect(fakeEl.inert).toBe(true);
    expect(attrs.get("inert")).toBe("");

    setElementInert(fakeEl, false);
    expect(fakeEl.inert).toBe(false);
    expect(attrs.has("inert")).toBe(false);
  });
});
