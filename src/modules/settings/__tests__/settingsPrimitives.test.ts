import { describe, expect, it } from "vitest";
import {
  clampTermScrollback,
  TERM_SCROLLBACK_MAX,
  TERM_SCROLLBACK_MIN,
} from "@/shared/defaults";
import {
  commitNumberDraft,
  matchesSettingsQuery,
} from "../components/SettingsPrimitives";

describe("SettingsPrimitives helpers", () => {
  it("matchesSettingsQuery supports multi-token diacritic-insensitive Vietnamese (including đ/Đ) & English search", () => {
    expect(
      matchesSettingsQuery("bo dem cuon", "Bộ đệm cuộn ngược", "Đặt lại mặc định")
    ).toBe(true);
    expect(matchesSettingsQuery("dat lai", "Đặt lại mục này")).toBe(true);
    expect(
      matchesSettingsQuery("scroll buffer", "Scrollback Buffer", "Maximum lines")
    ).toBe(true);
    expect(matchesSettingsQuery("webgl gpu", "Font Size", "Pixels")).toBe(false);
    expect(matchesSettingsQuery("   ", "Anything")).toBe(true);
  });

  it("commitNumberDraft clamps out-of-range drafts and skips redundant commits", () => {
    // Unchanged value does not emit committed payload
    expect(commitNumberDraft("10000", 10000, clampTermScrollback)).toEqual({
      nextDraft: "10000",
    });

    // Out-of-bounds low or high draft clamps cleanly on commit
    expect(commitNumberDraft("100", 10000, clampTermScrollback)).toEqual({
      nextDraft: String(TERM_SCROLLBACK_MIN),
      committed: TERM_SCROLLBACK_MIN,
    });
    expect(commitNumberDraft("999999", 10000, clampTermScrollback)).toEqual({
      nextDraft: String(TERM_SCROLLBACK_MAX),
      committed: TERM_SCROLLBACK_MAX,
    });
    expect(commitNumberDraft("20000", 10000, clampTermScrollback)).toEqual({
      nextDraft: "20000",
      committed: 20000,
    });
  });
});
