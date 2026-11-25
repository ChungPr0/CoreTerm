import React from "react";
import { TerminalSquare } from "lucide-react";
import {
  clampTermFontSize,
  clampTermLineHeight,
  clampTermScrollback,
  TERMINAL_FONT_PRESETS,
  TERM_FONT_FAMILY_DEFAULT,
  TERM_FONT_SIZE_MAX,
  TERM_FONT_SIZE_MIN,
  TERM_LINE_HEIGHT_MAX,
  TERM_LINE_HEIGHT_MIN,
  TERM_SCROLLBACK_MAX,
  TERM_SCROLLBACK_MIN,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { Select, Switch } from "@/shared/ui";
import type { AppSettingsValues, TerminalCursorStyle } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsNumberInput,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface TerminalSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const TerminalSettingsSection: React.FC<TerminalSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();
  const selectedFontValue = TERMINAL_FONT_PRESETS.some(
    (p) => p.value === settings.terminalFontFamily
  )
    ? settings.terminalFontFamily
    : TERM_FONT_FAMILY_DEFAULT;

  const showFontFamily = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_font_family"),
    t("settings.term_font_family_desc"),
    "font"
  );
  const showFontSize = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_font_size"),
    t("settings.term_font_size_desc"),
    "font size"
  );
  const showLineHeight = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_line_height"),
    t("settings.term_line_height_desc")
  );
  const showCursorStyle = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_cursor_style"),
    t("settings.term_cursor_block"),
    t("settings.term_cursor_bar"),
    t("settings.term_cursor_underline")
  );
  const showCursorBlink = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_cursor_blink"),
    t("settings.term_cursor_blink_desc")
  );
  const showScrollback = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_scrollback"),
    t("settings.term_scrollback_desc"),
    "buffer"
  );
  const showWebgl = matchesSettingsQuery(
    query,
    t("settings.cat_terminal"),
    t("settings.term_webgl"),
    t("settings.term_webgl_desc"),
    "gpu"
  );

  const anyVisible =
    showFontFamily ||
    showFontSize ||
    showLineHeight ||
    showCursorStyle ||
    showCursorBlink ||
    showScrollback ||
    showWebgl;

  if (!anyVisible) return null;

  const cursorBlinkClass = settings.terminalCursorBlink
    ? "animate-cursor-blink"
    : "";
  const cursorPreview =
    settings.terminalCursorStyle === "bar" ? (
      <span
        className={`inline-block w-[2px] h-[1.15em] align-middle bg-[#38bdf8] ${cursorBlinkClass}`}
      />
    ) : settings.terminalCursorStyle === "underline" ? (
      <span
        className={`inline-block w-[0.6em] h-[2px] align-baseline bg-[#38bdf8] ${cursorBlinkClass}`}
      />
    ) : (
      <span
        className={`inline-block w-[0.6em] h-[1.15em] align-middle bg-[#38bdf8] ${cursorBlinkClass}`}
      />
    );

  const showPreview = !query.trim() || showFontFamily || showFontSize || showLineHeight || showCursorStyle || showCursorBlink;

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<TerminalSquare className="w-4 h-4" />}
        title={t("settings.cat_terminal")}
        description={t("settings.cat_terminal_desc")}
      />

      {showPreview && (
        <div className="rounded-xl border border-slate-800/90 bg-[#090d16] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/80">
            <span className="text-[11px] font-medium text-slate-400">
              {t("settings.term_preview")}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {settings.terminalFontSize}px · {settings.terminalLineHeight.toFixed(2)}
            </span>
          </div>
          <div
            style={{
              fontFamily: settings.terminalFontFamily,
              fontSize: `${settings.terminalFontSize}px`,
              lineHeight: settings.terminalLineHeight,
            }}
            className="p-3.5 text-[#e2e8f0] select-none overflow-x-auto no-scrollbar whitespace-nowrap"
          >
            <div>
              <span className="text-[#10b981]">user@coreterm</span>
              <span className="text-[#475569]">:</span>
              <span className="text-[#3b82f6]">~/workspace</span>
              <span className="text-[#e2e8f0]">$ ssh prod-db -p 22</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[#38bdf8]">❯</span>
              <span className="text-[#f59e0b]">uptime</span>
              <span className="text-[#475569]">—</span>
              <span className="text-[#10b981]">ONLINE</span>
              <span className="text-[#f43f5e] ml-2">0 errors</span>
              <span className="ml-1">{cursorPreview}</span>
            </div>
          </div>
        </div>
      )}

      <SettingsCard title={t("settings.group_appearance")}>
        <SettingsRow
          visible={showFontFamily}
          title={t("settings.term_font_family")}
          description={t("settings.term_font_family_desc")}
        >
          <Select
            value={selectedFontValue}
            onChange={(e) => onPatch({ terminalFontFamily: e.target.value })}
            containerClassName="w-52"
          >
            {TERMINAL_FONT_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showFontSize}
          title={t("settings.term_font_size")}
          description={t("settings.term_font_size_desc")}
        >
          <SettingsNumberInput
            value={settings.terminalFontSize}
            min={TERM_FONT_SIZE_MIN}
            max={TERM_FONT_SIZE_MAX}
            clamp={clampTermFontSize}
            onCommit={(next) => onPatch({ terminalFontSize: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showLineHeight}
          title={t("settings.term_line_height")}
          description={t("settings.term_line_height_desc")}
        >
          <SettingsNumberInput
            value={settings.terminalLineHeight}
            min={TERM_LINE_HEIGHT_MIN}
            max={TERM_LINE_HEIGHT_MAX}
            step={0.05}
            clamp={clampTermLineHeight}
            onCommit={(next) => onPatch({ terminalLineHeight: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showCursorStyle}
          title={t("settings.term_cursor_style")}
        >
          <Select
            value={settings.terminalCursorStyle}
            onChange={(e) =>
              onPatch({ terminalCursorStyle: e.target.value as TerminalCursorStyle })
            }
            containerClassName="w-52"
          >
            <option value="block">{t("settings.term_cursor_block")}</option>
            <option value="bar">{t("settings.term_cursor_bar")}</option>
            <option value="underline">{t("settings.term_cursor_underline")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showCursorBlink}
          title={t("settings.term_cursor_blink")}
          description={t("settings.term_cursor_blink_desc")}
        >
          <Switch
            checked={settings.terminalCursorBlink}
            onChange={(checked) => onPatch({ terminalCursorBlink: checked })}
            aria-label={t("settings.term_cursor_blink")}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.group_behavior")}>
        <SettingsRow
          visible={showScrollback}
          title={t("settings.term_scrollback")}
          description={t("settings.term_scrollback_desc")}
        >
          <SettingsNumberInput
            value={settings.terminalScrollback}
            min={TERM_SCROLLBACK_MIN}
            max={TERM_SCROLLBACK_MAX}
            step={1000}
            clamp={clampTermScrollback}
            onCommit={(next) => onPatch({ terminalScrollback: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showWebgl}
          title={t("settings.term_webgl")}
          description={t("settings.term_webgl_desc")}
        >
          <Switch
            checked={settings.terminalWebglRenderer}
            onChange={(checked) => onPatch({ terminalWebglRenderer: checked })}
            aria-label={t("settings.term_webgl")}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsSectionFooter
        visible={!query.trim()}
        onResetSection={onResetSection}
      />
    </section>
  );
};
