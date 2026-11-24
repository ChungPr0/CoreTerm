import React from "react";
import { FileCode2 } from "lucide-react";
import {
  clampEditorFontSize,
  EDITOR_FONT_SIZE_MAX,
  EDITOR_FONT_SIZE_MIN,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { Select, Switch } from "@/shared/ui";
import type { AppSettingsValues, EditorTabSize } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsNumberInput,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface EditorSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const EditorSettingsSection: React.FC<EditorSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();

  const showFontSize = matchesSettingsQuery(
    query,
    t("settings.cat_editor"),
    t("settings.editor_font_size"),
    t("settings.editor_font_size_desc")
  );
  const showTabSize = matchesSettingsQuery(
    query,
    t("settings.cat_editor"),
    t("settings.editor_tab_size"),
    t("settings.editor_tab_size_desc")
  );
  const showWordWrap = matchesSettingsQuery(
    query,
    t("settings.cat_editor"),
    t("settings.editor_word_wrap"),
    t("settings.editor_word_wrap_desc")
  );
  const showLineNumbers = matchesSettingsQuery(
    query,
    t("settings.cat_editor"),
    t("settings.editor_line_numbers"),
    t("settings.editor_line_numbers_desc")
  );
  const showActiveLine = matchesSettingsQuery(
    query,
    t("settings.cat_editor"),
    t("settings.editor_active_line"),
    t("settings.editor_active_line_desc")
  );

  if (
    !showFontSize &&
    !showTabSize &&
    !showWordWrap &&
    !showLineNumbers &&
    !showActiveLine
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<FileCode2 className="w-4 h-4" />}
        title={t("settings.cat_editor")}
        description={t("settings.cat_editor_desc")}
      />

      <SettingsCard>
        <SettingsRow
          visible={showFontSize}
          title={t("settings.editor_font_size")}
          description={t("settings.editor_font_size_desc")}
        >
          <SettingsNumberInput
            value={settings.editorFontSize}
            min={EDITOR_FONT_SIZE_MIN}
            max={EDITOR_FONT_SIZE_MAX}
            clamp={clampEditorFontSize}
            onCommit={(next) => onPatch({ editorFontSize: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showTabSize}
          title={t("settings.editor_tab_size")}
          description={t("settings.editor_tab_size_desc")}
        >
          <Select
            value={String(settings.editorTabSize)}
            onChange={(e) =>
              onPatch({ editorTabSize: Number(e.target.value) as EditorTabSize })
            }
            containerClassName="w-52"
          >
            <option value="2">2</option>
            <option value="4">4</option>
            <option value="8">8</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showWordWrap}
          title={t("settings.editor_word_wrap")}
          description={t("settings.editor_word_wrap_desc")}
        >
          <Switch
            checked={settings.editorWordWrap}
            onChange={(checked) => onPatch({ editorWordWrap: checked })}
            aria-label={t("settings.editor_word_wrap")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showLineNumbers}
          title={t("settings.editor_line_numbers")}
          description={t("settings.editor_line_numbers_desc")}
        >
          <Switch
            checked={settings.editorLineNumbers}
            onChange={(checked) => onPatch({ editorLineNumbers: checked })}
            aria-label={t("settings.editor_line_numbers")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showActiveLine}
          title={t("settings.editor_active_line")}
          description={t("settings.editor_active_line_desc")}
        >
          <Switch
            checked={settings.editorHighlightActiveLine}
            onChange={(checked) => onPatch({ editorHighlightActiveLine: checked })}
            aria-label={t("settings.editor_active_line")}
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
