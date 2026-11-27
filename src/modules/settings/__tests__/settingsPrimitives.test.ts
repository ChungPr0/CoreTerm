import { describe, expect, it } from "vitest";
import {
  clampTermFontSize,
  clampTermLineHeight,
  clampTermScrollback,
  TERM_FONT_SIZE_MAX,
  TERM_FONT_SIZE_MIN,
  TERM_LINE_HEIGHT_MAX,
  TERM_LINE_HEIGHT_MIN,
  TERM_SCROLLBACK_MAX,
  TERM_SCROLLBACK_MIN,
} from "@/shared/defaults";
import {
  commitNumberDraft,
  liveCommitNumberDraft,
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

  it("liveCommitNumberDraft commits valid in-range numbers immediately without breaking intermediate edits", () => {
    // Empty or intermediate out-of-bounds digits wait for blur/Enter
    expect(
      liveCommitNumberDraft("", 16, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX, clampTermFontSize)
    ).toBeUndefined();
    expect(
      liveCommitNumberDraft("1", 16, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX, clampTermFontSize)
    ).toBeUndefined();
    expect(
      liveCommitNumberDraft("99", 16, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX, clampTermFontSize)
    ).toBeUndefined();

    // Valid in-range integer commits immediately
    expect(
      liveCommitNumberDraft("18", 16, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX, clampTermFontSize)
    ).toBe(18);
    // Unchanged value skips redundant commit
    expect(
      liveCommitNumberDraft("16", 16, TERM_FONT_SIZE_MIN, TERM_FONT_SIZE_MAX, clampTermFontSize)
    ).toBeUndefined();

    // Trailing decimal point waits for fraction digits, then commits immediately
    expect(
      liveCommitNumberDraft(
        "1.",
        1.0,
        TERM_LINE_HEIGHT_MIN,
        TERM_LINE_HEIGHT_MAX,
        clampTermLineHeight
      )
    ).toBeUndefined();
    expect(
      liveCommitNumberDraft(
        "1.25",
        1.0,
        TERM_LINE_HEIGHT_MIN,
        TERM_LINE_HEIGHT_MAX,
        clampTermLineHeight
      )
    ).toBe(1.25);
  });
});
