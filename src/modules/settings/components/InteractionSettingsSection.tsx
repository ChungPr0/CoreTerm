import React from "react";
import { MousePointerClick } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Select, Switch } from "@/shared/ui";
import type { AppSettingsValues, WarnPasteMultilineMode } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface InteractionSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const InteractionSettingsSection: React.FC<InteractionSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();

  const showCopyOnSelect = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_clipboard_mouse"),
    t("settings.term_copy_on_select"),
    t("settings.term_copy_on_select_desc"),
    "clipboard copy selection"
  );
  const showRightClickPaste = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_clipboard_mouse"),
    t("settings.term_right_click_paste"),
    t("settings.term_right_click_paste_desc"),
    "clipboard paste right click mouse"
  );
  const showTrimPaste = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_clipboard_mouse"),
    t("settings.term_trim_paste"),
    t("settings.term_trim_paste_desc"),
    "paste trim trailing whitespace space"
  );
  const showCtrlScrollZoom = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_clipboard_mouse"),
    t("settings.term_ctrl_scroll_zoom"),
    t("settings.term_ctrl_scroll_zoom_desc"),
    "zoom font size scroll ctrl wheel"
  );
  const showDetectUrls = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_clipboard_mouse"),
    t("settings.term_detect_urls"),
    t("settings.term_detect_urls_desc"),
    "url link clickable browser http"
  );
  const showWarnCloseTabs = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_warnings"),
    t("settings.warn_close_multi_tabs"),
    t("settings.warn_close_multi_tabs_desc"),
    "warn close tab exit confirm"
  );
  const showWarnPasteLarge = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_warnings"),
    t("settings.warn_paste_large"),
    t("settings.warn_paste_large_desc"),
    "warn paste 5 kib large size clipboard"
  );
  const showWarnPasteMultiline = matchesSettingsQuery(
    query,
    t("settings.cat_interaction"),
    t("settings.group_warnings"),
    t("settings.warn_paste_multiline"),
    t("settings.warn_paste_multiline_desc"),
    t("settings.warn_paste_multiline_bracketed"),
    t("settings.warn_paste_multiline_always"),
    t("settings.warn_paste_multiline_never"),
    "warn paste newline multiline bracketed"
  );

  const anyVisible =
    showCopyOnSelect ||
    showRightClickPaste ||
    showTrimPaste ||
    showCtrlScrollZoom ||
    showDetectUrls ||
    showWarnCloseTabs ||
    showWarnPasteLarge ||
    showWarnPasteMultiline;

  if (!anyVisible) return null;

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<MousePointerClick className="w-4 h-4" />}
        title={t("settings.cat_interaction")}
        description={t("settings.cat_interaction_desc")}
      />

      <SettingsCard title={t("settings.group_clipboard_mouse")}>
        <SettingsRow
          visible={showCopyOnSelect}
          title={t("settings.term_copy_on_select")}
          description={t("settings.term_copy_on_select_desc")}
        >
          <Switch
            checked={settings.terminalCopyOnSelect}
            onChange={(checked) => onPatch({ terminalCopyOnSelect: checked })}
            aria-label={t("settings.term_copy_on_select")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showRightClickPaste}
          title={t("settings.term_right_click_paste")}
          description={t("settings.term_right_click_paste_desc")}
        >
          <Switch
            checked={settings.terminalRightClickPaste}
            onChange={(checked) => onPatch({ terminalRightClickPaste: checked })}
            aria-label={t("settings.term_right_click_paste")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showTrimPaste}
          title={t("settings.term_trim_paste")}
          description={t("settings.term_trim_paste_desc")}
        >
          <Switch
            checked={settings.terminalTrimPasteWhitespace}
            onChange={(checked) => onPatch({ terminalTrimPasteWhitespace: checked })}
            aria-label={t("settings.term_trim_paste")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showCtrlScrollZoom}
          title={t("settings.term_ctrl_scroll_zoom")}
          description={t("settings.term_ctrl_scroll_zoom_desc")}
        >
          <Switch
            checked={settings.terminalCtrlScrollZoom}
            onChange={(checked) => onPatch({ terminalCtrlScrollZoom: checked })}
            aria-label={t("settings.term_ctrl_scroll_zoom")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showDetectUrls}
          title={t("settings.term_detect_urls")}
          description={t("settings.term_detect_urls_desc")}
        >
          <Switch
            checked={settings.terminalDetectUrls}
            onChange={(checked) => onPatch({ terminalDetectUrls: checked })}
            aria-label={t("settings.term_detect_urls")}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.group_warnings")}>
        <SettingsRow
          visible={showWarnCloseTabs}
          title={t("settings.warn_close_multi_tabs")}
          description={t("settings.warn_close_multi_tabs_desc")}
        >
          <Switch
            checked={settings.warnCloseMultiTabs}
            onChange={(checked) => onPatch({ warnCloseMultiTabs: checked })}
            aria-label={t("settings.warn_close_multi_tabs")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showWarnPasteLarge}
          title={t("settings.warn_paste_large")}
          description={t("settings.warn_paste_large_desc")}
        >
          <Switch
            checked={settings.warnPasteLarge}
            onChange={(checked) => onPatch({ warnPasteLarge: checked })}
            aria-label={t("settings.warn_paste_large")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showWarnPasteMultiline}
          title={t("settings.warn_paste_multiline")}
          description={t("settings.warn_paste_multiline_desc")}
        >
          <Select
            value={settings.warnPasteMultiline}
            onChange={(e) =>
              onPatch({ warnPasteMultiline: e.target.value as WarnPasteMultilineMode })
            }
            containerClassName="w-64"
          >
            <option value="bracketed_disabled">
              {t("settings.warn_paste_multiline_bracketed")}
            </option>
            <option value="always">{t("settings.warn_paste_multiline_always")}</option>
            <option value="never">{t("settings.warn_paste_multiline_never")}</option>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsSectionFooter
        visible={!query.trim()}
        onResetSection={onResetSection}
      />
    </section>
  );
};
