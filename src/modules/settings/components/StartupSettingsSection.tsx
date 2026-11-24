import React, { useEffect, useState } from "react";
import { Rocket } from "lucide-react";
import {
  clampLaunchCols,
  clampLaunchRows,
  LAUNCH_COLS_MAX,
  LAUNCH_COLS_MIN,
  LAUNCH_ROWS_MAX,
  LAUNCH_ROWS_MIN,
  TOAST_COPY_MS,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { Select, Switch, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { windowApi } from "@/modules/workspace/api/windowApi";
import type {
  AppSettingsValues,
  DefaultImeMode,
  LaunchMode,
  NewInstanceBehavior,
  StartupBehavior,
} from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsNumberInput,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface StartupSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  resetSeq?: number;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const StartupSettingsSection: React.FC<StartupSettingsSectionProps> = ({
  settings,
  query,
  resetSeq = 0,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [startupBusy, setStartupBusy] = useState(false);

  useEffect(() => {
    let active = true;
    windowApi
      .startupGetStatus()
      .then((status) => {
        if (active) setStartupEnabled(status);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [resetSeq]);

  const handleToggleStartup = async (next: boolean) => {
    if (startupBusy) return;
    const prev = startupEnabled;
    setStartupEnabled(next);
    setStartupBusy(true);
    try {
      const actual = await windowApi.startupSetEnabled(next);
      setStartupEnabled(actual);
      alert.info(
        t(actual ? "settings.launch_on_startup_enabled" : "settings.launch_on_startup_disabled"),
        TOAST_COPY_MS
      );
    } catch (err) {
      setStartupEnabled(prev);
      alert.error(formatLocalizedError(err, t));
    } finally {
      setStartupBusy(false);
    }
  };

  const showLaunchOnStartup = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.launch_on_startup"),
    t("settings.launch_on_startup_desc"),
    "startup windows autorun"
  );
  const showStartupBehavior = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.startup_behavior"),
    t("settings.startup_behavior_desc"),
    t("settings.startup_default_profile"),
    t("settings.startup_restore_session"),
    "startup restore session"
  );
  const showNewInstance = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.new_instance"),
    t("settings.new_instance_desc"),
    t("settings.new_instance_attach"),
    t("settings.new_instance_window"),
    "instance window attach"
  );
  const showImeMode = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.ime_mode"),
    t("settings.ime_mode_desc"),
    t("settings.ime_default"),
    t("settings.ime_alphanumeric"),
    "ime input english"
  );
  const showLaunchMode = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.launch_size"),
    t("settings.launch_mode"),
    t("settings.launch_mode_desc"),
    t("settings.launch_mode_default"),
    t("settings.launch_mode_maximized"),
    t("settings.launch_mode_fullscreen"),
    "launch parameters fullscreen maximized"
  );
  const showLaunchSize = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.launch_size"),
    t("settings.cols"),
    t("settings.rows"),
    "window size"
  );
  const showCenterOnLaunch = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.launch_size"),
    t("settings.center_on_launch"),
    t("settings.center_on_launch_desc"),
    "center launch parameters"
  );
  const showAlwaysOnTop = matchesSettingsQuery(
    query,
    t("settings.cat_startup"),
    t("settings.launch_size"),
    t("settings.always_on_top"),
    t("settings.always_on_top_desc"),
    "always on top pin"
  );

  if (
    !showLaunchOnStartup &&
    !showStartupBehavior &&
    !showNewInstance &&
    !showImeMode &&
    !showLaunchMode &&
    !showLaunchSize &&
    !showCenterOnLaunch &&
    !showAlwaysOnTop
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<Rocket className="w-4 h-4" />}
        title={t("settings.cat_startup")}
        description={t("settings.cat_startup_desc")}
      />

      <SettingsCard title={t("settings.group_behavior")}>
        <SettingsRow
          visible={showLaunchOnStartup}
          title={t("settings.launch_on_startup")}
          description={t("settings.launch_on_startup_desc")}
        >
          <Switch
            checked={startupEnabled}
            disabled={startupBusy}
            onChange={(next) => void handleToggleStartup(next)}
            aria-label={t("settings.launch_on_startup")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showStartupBehavior}
          title={t("settings.startup_behavior")}
          description={t("settings.startup_behavior_desc")}
        >
          <Select
            value={settings.startupBehavior}
            onChange={(e) =>
              onPatch({ startupBehavior: e.target.value as StartupBehavior })
            }
            containerClassName="w-56"
          >
            <option value="default_profile">
              {t("settings.startup_default_profile")}
            </option>
            <option value="restore_session">
              {t("settings.startup_restore_session")}
            </option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showNewInstance}
          title={t("settings.new_instance")}
          description={t("settings.new_instance_desc")}
        >
          <Select
            value={settings.newInstanceBehavior}
            onChange={(e) =>
              onPatch({ newInstanceBehavior: e.target.value as NewInstanceBehavior })
            }
            containerClassName="w-56"
          >
            <option value="attach">{t("settings.new_instance_attach")}</option>
            <option value="new_window">{t("settings.new_instance_window")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showImeMode}
          title={t("settings.ime_mode")}
          description={t("settings.ime_mode_desc")}
        >
          <Select
            value={settings.defaultImeMode}
            onChange={(e) =>
              onPatch({ defaultImeMode: e.target.value as DefaultImeMode })
            }
            containerClassName="w-56"
          >
            <option value="default">{t("settings.ime_default")}</option>
            <option value="alphanumeric">{t("settings.ime_alphanumeric")}</option>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.launch_size")}>
        <SettingsRow
          visible={showLaunchMode}
          title={t("settings.launch_mode")}
          description={t("settings.launch_mode_desc")}
        >
          <Select
            value={settings.launchMode}
            onChange={(e) => onPatch({ launchMode: e.target.value as LaunchMode })}
            containerClassName="w-52"
          >
            <option value="default">{t("settings.launch_mode_default")}</option>
            <option value="maximized">{t("settings.launch_mode_maximized")}</option>
            <option value="fullscreen">{t("settings.launch_mode_fullscreen")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow visible={showLaunchSize} title={t("settings.cols")}>
          <SettingsNumberInput
            value={settings.launchCols}
            min={LAUNCH_COLS_MIN}
            max={LAUNCH_COLS_MAX}
            clamp={clampLaunchCols}
            onCommit={(next) => onPatch({ launchCols: next })}
          />
        </SettingsRow>

        <SettingsRow visible={showLaunchSize} title={t("settings.rows")}>
          <SettingsNumberInput
            value={settings.launchRows}
            min={LAUNCH_ROWS_MIN}
            max={LAUNCH_ROWS_MAX}
            clamp={clampLaunchRows}
            onCommit={(next) => onPatch({ launchRows: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showCenterOnLaunch}
          title={t("settings.center_on_launch")}
          description={t("settings.center_on_launch_desc")}
        >
          <Switch
            checked={settings.centerOnLaunch}
            onChange={(checked) => onPatch({ centerOnLaunch: checked })}
            aria-label={t("settings.center_on_launch")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showAlwaysOnTop}
          title={t("settings.always_on_top")}
          description={t("settings.always_on_top_desc")}
        >
          <Switch
            checked={settings.alwaysOnTop}
            onChange={(checked) => onPatch({ alwaysOnTop: checked })}
            aria-label={t("settings.always_on_top")}
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
