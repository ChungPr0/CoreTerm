import React, { useEffect, useState } from "react";
import { Sliders } from "lucide-react";
import { TOAST_COPY_MS } from "@/shared/defaults";
import { type LocalePreference, useI18n } from "@/shared/i18n";
import { Select, Switch, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { sessionApi } from "@/modules/terminal/api/sessionApi";
import type { AppSettingsValues, CloseLastTabBehavior } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface GeneralSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  resetSeq?: number;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
  onRequestResetAll: () => void;
}

export const GeneralSettingsSection: React.FC<GeneralSettingsSectionProps> = ({
  settings,
  query,
  resetSeq = 0,
  onPatch,
  onResetSection,
  onRequestResetAll,
}) => {
  const { localePreference, setLocalePreference, t } = useI18n();
  const alert = useAlert();
  const [contextMenuEnabled, setContextMenuEnabled] = useState(false);
  const [contextMenuBusy, setContextMenuBusy] = useState(false);

  useEffect(() => {
    let active = true;
    sessionApi
      .contextMenuGetStatus()
      .then((status) => {
        if (active) setContextMenuEnabled(status);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [resetSeq]);

  const handleToggleContextMenu = async (next: boolean) => {
    if (contextMenuBusy) return;
    const prev = contextMenuEnabled;
    setContextMenuEnabled(next);
    setContextMenuBusy(true);
    try {
      await sessionApi.contextMenuSetEnabled(next);
      alert.info(
        t(next ? "settings.context_menu_enabled" : "settings.context_menu_disabled"),
        TOAST_COPY_MS
      );
    } catch (err) {
      setContextMenuEnabled(prev);
      alert.error(formatLocalizedError(err, t));
    } finally {
      setContextMenuBusy(false);
    }
  };

  const showLang = matchesSettingsQuery(
    query,
    t("settings.cat_general"),
    t("settings.lang"),
    t("settings.lang_desc"),
    t("settings.lang_system"),
    t("settings.lang_vi"),
    t("settings.lang_en"),
    "language"
  );
  const showCloseLastTab = matchesSettingsQuery(
    query,
    t("settings.cat_general"),
    t("settings.close_last_tab"),
    t("settings.close_last_tab_desc"),
    t("settings.close_last_tab_exit"),
    t("settings.close_last_tab_new_local")
  );
  const showContextMenu = matchesSettingsQuery(
    query,
    t("settings.cat_general"),
    t("settings.context_menu_title"),
    t("settings.context_menu_desc"),
    "explorer"
  );
  const showResetFooter =
    !query.trim() ||
    matchesSettingsQuery(
      query,
      t("settings.reset_section"),
      t("settings.reset_all_btn"),
      "reset"
    );

  if (
    !showLang &&
    !showCloseLastTab &&
    !showContextMenu &&
    !showResetFooter
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<Sliders className="w-4 h-4" />}
        title={t("settings.cat_general")}
        description={t("settings.cat_general_desc")}
      />

      <SettingsCard>
        <SettingsRow
          visible={showLang}
          title={t("settings.lang")}
          description={t("settings.lang_desc")}
        >
          <Select
            value={localePreference}
            onChange={(e) => setLocalePreference(e.target.value as LocalePreference)}
            containerClassName="w-52"
          >
            <option value="system">{t("settings.lang_system")}</option>
            <option value="vi">{t("settings.lang_vi")}</option>
            <option value="en">{t("settings.lang_en")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showCloseLastTab}
          title={t("settings.close_last_tab")}
          description={t("settings.close_last_tab_desc")}
        >
          <Select
            value={settings.closeLastTabBehavior}
            onChange={(e) =>
              onPatch({ closeLastTabBehavior: e.target.value as CloseLastTabBehavior })
            }
            containerClassName="w-52"
          >
            <option value="exit">{t("settings.close_last_tab_exit")}</option>
            <option value="new_local">{t("settings.close_last_tab_new_local")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showContextMenu}
          title={t("settings.context_menu_title")}
          description={t("settings.context_menu_desc")}
        >
          <Switch
            checked={contextMenuEnabled}
            disabled={contextMenuBusy}
            onChange={(next) => void handleToggleContextMenu(next)}
            aria-label={t("settings.context_menu_title")}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsSectionFooter
        visible={showResetFooter}
        onResetSection={onResetSection}
        onRequestResetAll={onRequestResetAll}
      />
    </section>
  );
};
