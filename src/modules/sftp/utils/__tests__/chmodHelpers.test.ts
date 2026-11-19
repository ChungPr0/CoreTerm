import { describe, expect, it } from "vitest";
import {
  cleanOctalInput,
  isBitSet,
  modeToOctal,
  octalToMode,
  toggleModeBit,
} from "../chmodHelpers";

describe("chmodHelpers", () => {
  it("cleans octal input, stripping non-octal chars and limiting to 4 digits", () => {
    expect(cleanOctalInput("0755")).toBe("0755");
    expect(cleanOctalInput("7777")).toBe("7777");
    expect(cleanOctalInput("075555")).toBe("0755"); // limits to 4 chars
    expect(cleanOctalInput("abc89_!0644")).toBe("0644"); // strips non 0-7
    expect(cleanOctalInput("")).toBe("");
    expect(cleanOctalInput("999")).toBe("");
  });

  it("converts valid octal strings to mode integer and validates boundaries", () => {
    expect(octalToMode("755")).toBe(0o755);
    expect(octalToMode("0755")).toBe(0o755);
    expect(octalToMode("644")).toBe(0o644);
    expect(octalToMode("7777")).toBe(0o7777);
    expect(octalToMode("0000")).toBe(0);
    expect(octalToMode("")).toBeNull();
    expect(octalToMode("888")).toBeNull();
  });

  it("formats mode integer into 3-digit or 4-digit octal string", () => {
    expect(modeToOctal(0o755)).toBe("755");
    expect(modeToOctal(0o644)).toBe("644");
    expect(modeToOctal(0o700)).toBe("700");
    expect(modeToOctal(0o4755)).toBe("4755");
    expect(modeToOctal(0o1777)).toBe("1777");
    expect(modeToOctal(0)).toBe("000");
  });

  it("toggles permission bits and checks if bits are set", () => {
    let mode = 0o644; // rw-r--r--
    expect(isBitSet(mode, 0o400)).toBe(true); // owner read
    expect(isBitSet(mode, 0o200)).toBe(true); // owner write
    expect(isBitSet(mode, 0o100)).toBe(false); // owner exec

    // Toggle execute bit on for owner
    mode = toggleModeBit(mode, 0o100);
    expect(mode).toBe(0o744);
    expect(isBitSet(mode, 0o100)).toBe(true);

    // Toggle execute bit back off
    mode = toggleModeBit(mode, 0o100);
    expect(mode).toBe(0o644);
    expect(isBitSet(mode, 0o100)).toBe(false);
  });
});
