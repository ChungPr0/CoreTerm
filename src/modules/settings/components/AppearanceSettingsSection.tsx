import React from "react";
import { Palette } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Select, Switch } from "@/shared/ui";
import type { AppSettingsValues, NewTabPosition, TabWidthMode } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface AppearanceSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const AppearanceSettingsSection: React.FC<AppearanceSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();

  const showActiveTitle = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_window"),
    t("settings.use_active_tab_title"),
    t("settings.use_active_tab_title_desc"),
    "window title taskbar"
  );
  const showAlwaysOnTop = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_window"),
    t("settings.always_on_top"),
    t("settings.always_on_top_desc"),
    "always on top pin topmost window"
  );
  const showAdminShield = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_window"),
    t("settings.show_admin_shield"),
    t("settings.show_admin_shield_desc"),
    "admin administrator shield badge title bar"
  );
  const showNewTabPos = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_tabs"),
    t("settings.new_tab_position"),
    t("settings.new_tab_position_desc"),
    t("settings.new_tab_pos_end"),
    t("settings.new_tab_pos_after_current"),
    "tab position order new"
  );
  const showTabWidth = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_tabs"),
    t("settings.tab_width_mode"),
    t("settings.tab_width_mode_desc"),
    t("settings.tab_width_equal"),
    t("settings.tab_width_title"),
    t("settings.tab_width_compact"),
    "tab width compact equal title size"
  );
  const showFullscreenTabs = matchesSettingsQuery(
    query,
    t("settings.cat_appearance"),
    t("settings.group_tabs"),
    t("settings.show_tabs_fullscreen"),
    t("settings.show_tabs_fullscreen_desc"),
    "fullscreen full screen tab bar f11"
  );

  const anyVisible =
    showActiveTitle ||
    showAlwaysOnTop ||
    showAdminShield ||
    showNewTabPos ||
    showTabWidth ||
    showFullscreenTabs;

  if (!anyVisible) return null;

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<Palette className="w-4 h-4" />}
        title={t("settings.cat_appearance")}
        description={t("settings.cat_appearance_desc")}
      />

      <SettingsCard title={t("settings.group_window")}>
        <SettingsRow
          visible={showActiveTitle}
          title={t("settings.use_active_tab_title")}
          description={t("settings.use_active_tab_title_desc")}
        >
          <Switch
            checked={settings.useActiveTabTitle}
            onChange={(checked) => onPatch({ useActiveTabTitle: checked })}
            aria-label={t("settings.use_active_tab_title")}
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

        <SettingsRow
          visible={showAdminShield}
          title={t("settings.show_admin_shield")}
          description={t("settings.show_admin_shield_desc")}
        >
          <Switch
            checked={settings.showAdminShield}
            onChange={(checked) => onPatch({ showAdminShield: checked })}
            aria-label={t("settings.show_admin_shield")}
          />
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.group_tabs")}>
        <SettingsRow
          visible={showNewTabPos}
          title={t("settings.new_tab_position")}
          description={t("settings.new_tab_position_desc")}
        >
          <Select
            value={settings.newTabPosition}
            onChange={(e) =>
              onPatch({ newTabPosition: e.target.value as NewTabPosition })
            }
            containerClassName="w-56"
          >
            <option value="end">{t("settings.new_tab_pos_end")}</option>
            <option value="after_current">
              {t("settings.new_tab_pos_after_current")}
            </option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showTabWidth}
          title={t("settings.tab_width_mode")}
          description={t("settings.tab_width_mode_desc")}
        >
          <Select
            value={settings.tabWidthMode}
            onChange={(e) =>
              onPatch({ tabWidthMode: e.target.value as TabWidthMode })
            }
            containerClassName="w-56"
          >
            <option value="equal">{t("settings.tab_width_equal")}</option>
            <option value="title_length">{t("settings.tab_width_title")}</option>
            <option value="compact">{t("settings.tab_width_compact")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showFullscreenTabs}
          title={t("settings.show_tabs_fullscreen")}
          description={t("settings.show_tabs_fullscreen_desc")}
        >
          <Switch
            checked={settings.showTabsInFullscreen}
            onChange={(checked) => onPatch({ showTabsInFullscreen: checked })}
            aria-label={t("settings.show_tabs_fullscreen")}
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
