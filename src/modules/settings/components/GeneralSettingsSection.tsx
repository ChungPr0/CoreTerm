import React, { useEffect, useState } from "react";
import { ArrowUpCircle, RefreshCw, Sliders } from "lucide-react";
import { type LocalePreference, useI18n } from "@/shared/i18n";
import { Button, Select, Switch, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { sessionApi } from "@/modules/terminal/api/sessionApi";
import { useUpdaterStore } from "@/modules/updater";
import type {
  AppSettingsValues,
  CloseLastTabBehavior,
  UpdateMode,
} from "../types";
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

  const updateEnv = useUpdaterStore((s) => s.env);
  const updatePhase = useUpdaterStore((s) => s.phase);
  const latestUpdate = useUpdaterStore((s) => s.latest);
  const updateProgress = useUpdaterStore((s) => s.progress);
  const checkForUpdate = useUpdaterStore((s) => s.checkForUpdate);
  const openUpdateModal = useUpdaterStore((s) => s.openModal);

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
      const actual = await sessionApi.contextMenuSetEnabled(next);
      setContextMenuEnabled(actual);
    } catch (err) {
      setContextMenuEnabled(prev);
      alert.error(formatLocalizedError(err, t));
    } finally {
      setContextMenuBusy(false);
    }
  };

  const handleManualUpdateCheck = async () => {
    try {
      await checkForUpdate({
        updateMode: settings.updateMode,
        silent: false,
      });
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    }
  };

  const pkgLabel =
    updateEnv.install_kind === "nsis"
      ? t("settings.update_pkg_nsis")
      : updateEnv.install_kind === "msi"
        ? t("settings.update_pkg_msi")
        : updateEnv.install_kind === "dev"
          ? t("settings.update_pkg_dev")
          : t("settings.update_pkg_portable");

  const updateStatusText =
    updatePhase === "checking"
      ? t("settings.update_status_checking", {
          version: updateEnv.current_version,
        })
      : updatePhase === "downloading"
        ? t("settings.update_status_downloading", {
            latest: latestUpdate?.version ?? "",
            percent: updateProgress?.percent ?? 0,
          })
        : updatePhase === "ready" && latestUpdate?.version
          ? t("settings.update_status_ready", { latest: latestUpdate.version })
          : updatePhase === "available" && latestUpdate?.version
            ? t("settings.update_status_available", {
                latest: latestUpdate.version,
              })
            : updatePhase === "up_to_date"
              ? t("settings.update_status_latest", {
                  version: updateEnv.current_version,
                  pkg: pkgLabel,
                })
              : t("settings.update_status_idle", {
                  version: updateEnv.current_version,
                  pkg: pkgLabel,
                });

  const supportsAutoDownload = updateEnv.supports_silent_auto_download;
  const effectiveSelectMode: UpdateMode =
    !supportsAutoDownload && settings.updateMode === "auto"
      ? "notify"
      : settings.updateMode;
  const hasActionableUpdate =
    (updatePhase === "available" || updatePhase === "ready") &&
    Boolean(latestUpdate?.available && latestUpdate?.version);

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
  const showUpdateStatus = matchesSettingsQuery(
    query,
    t("settings.cat_general"),
    t("settings.group_updates"),
    t("settings.update_status_title"),
    t("settings.update_check_btn"),
    pkgLabel,
    updateEnv.current_version,
    "update version release"
  );
  const showUpdateMode = matchesSettingsQuery(
    query,
    t("settings.cat_general"),
    t("settings.group_updates"),
    t("settings.update_auto_mode"),
    t("settings.update_auto_mode_desc"),
    t("settings.update_mode_auto"),
    t("settings.update_mode_notify"),
    t("settings.update_mode_off"),
    "auto update release"
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
    !showUpdateStatus &&
    !showUpdateMode &&
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

      <SettingsCard title={t("settings.group_updates")}>
        <SettingsRow
          visible={showUpdateStatus}
          title={t("settings.update_status_title")}
          description={updateStatusText}
        >
          {hasActionableUpdate ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<ArrowUpCircle className="w-3.5 h-3.5" />}
              onClick={openUpdateModal}
            >
              {t("settings.update_view_btn")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={updatePhase === "checking" || updatePhase === "downloading"}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => void handleManualUpdateCheck()}
            >
              {t("settings.update_check_btn")}
            </Button>
          )}
        </SettingsRow>

        <SettingsRow
          visible={showUpdateMode}
          title={t("settings.update_auto_mode")}
          description={
            supportsAutoDownload
              ? t("settings.update_auto_mode_desc")
              : t("settings.update_auto_mode_portable_desc")
          }
        >
          <Select
            value={effectiveSelectMode}
            onChange={(e) => onPatch({ updateMode: e.target.value as UpdateMode })}
            containerClassName="w-60"
          >
            {supportsAutoDownload && (
              <option value="auto">{t("settings.update_mode_auto")}</option>
            )}
            <option value="notify">{t("settings.update_mode_notify")}</option>
            <option value="off">{t("settings.update_mode_off")}</option>
          </Select>
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
