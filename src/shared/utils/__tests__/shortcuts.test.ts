import { describe, expect, it } from "vitest";
import {
  eventToShortcutChord,
  findConflictingShortcut,
  getShortcutChord,
  isValidShortcutChord,
  normalizeShortcutChord,
  sanitizeKeybindings,
} from "../shortcuts";

describe("shortcuts utility", () => {
  it("normalizes key chords consistently and validates modifier/F-key rules", () => {
    expect(normalizeShortcutChord("ctrl + shift + t")).toBe("Ctrl+Shift+T");
    expect(normalizeShortcutChord("Alt + 1")).toBe("Alt+1");
    expect(normalizeShortcutChord("f11")).toBe("F11");
    expect(normalizeShortcutChord("Ctrl++")).toBe("Ctrl+=");
    expect(normalizeShortcutChord("Ctrl+-")).toBe("Ctrl+-");

    expect(isValidShortcutChord("Ctrl+Shift+T")).toBe(true);
    expect(isValidShortcutChord("Ctrl+W")).toBe(true);
    expect(isValidShortcutChord("Alt+D")).toBe(true);
    expect(isValidShortcutChord("F11")).toBe(true);

    // Unsafe or bare keys must be rejected
    expect(isValidShortcutChord("A")).toBe(false);
    expect(isValidShortcutChord("Shift+A")).toBe(false);
    expect(isValidShortcutChord("Tab")).toBe(false);
    expect(isValidShortcutChord("Alt+F4")).toBe(false);
  });

  it("converts DOM KeyboardEvents into canonical chords", () => {
    expect(
      eventToShortcutChord({
        key: "d",
        code: "KeyD",
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
      } as KeyboardEvent)
    ).toBe("Ctrl+Shift+D");

    expect(
      eventToShortcutChord({
        key: "Tab",
        code: "Tab",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      } as KeyboardEvent)
    ).toBe("Ctrl+Tab");

    expect(
      eventToShortcutChord({
        key: "!",
        code: "Digit1",
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
      } as KeyboardEvent)
    ).toBe("Ctrl+Shift+1");

    // Modifier-only or Ctrl+Meta chord returns null
    expect(
      eventToShortcutChord({
        key: "Control",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      } as KeyboardEvent)
    ).toBeNull();
  });

  it("detects conflicts and sanitizes persisted keybinding overrides", () => {
    const conflict = findConflictingShortcut("Ctrl+Shift+T", {}, "duplicateTab");
    expect(conflict?.id).toBe("newTab");
    expect(findConflictingShortcut("Ctrl+Shift+T", {}, "newTab")).toBeNull();

    const sanitized = sanitizeKeybindings({
      closeTab: "ctrl+w",
      newTab: "Ctrl+Shift+T", // matches default -> stripped
      duplicateTab: "Ctrl+W", // collides with closeTab -> dropped
      openSettings: "A", // invalid bare key -> dropped
      termClear: "Alt+F4", // reserved -> dropped
    });

    expect(sanitized).toEqual({ closeTab: "Ctrl+W" });
    expect(getShortcutChord("closeTab", sanitized)).toBe("Ctrl+W");
    expect(getShortcutChord("duplicateTab", sanitized)).toBe("Ctrl+Shift+D");
  });

  it("reserves Ctrl+F for Find while allowing termFind itself to bind Ctrl+F", () => {
    expect(findConflictingShortcut("Ctrl+F", {}, "termClear")?.id).toBe("termFind");
    expect(findConflictingShortcut("Ctrl+F", {}, "newTab")?.id).toBe("termFind");
    expect(findConflictingShortcut("Ctrl+F", {}, "termFind")).toBeNull();

    expect(sanitizeKeybindings({ termClear: "Ctrl+F" })).toEqual({});
    expect(sanitizeKeybindings({ termFind: "Ctrl+F" })).toEqual({
      termFind: "Ctrl+F",
    });
  });
});
