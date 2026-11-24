import React from "react";
import { FolderSync } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy } from "@/shared/types/ipc";
import { Select, Switch } from "@/shared/ui";
import type { AppSettingsValues, SftpDoubleClickAction } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface SftpSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onResetSection?: () => void;
}

export const SftpSettingsSection: React.FC<SftpSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onResetSection,
}) => {
  const { t } = useI18n();

  const showPolicy = matchesSettingsQuery(
    query,
    t("settings.cat_sftp"),
    t("settings.sftp_conflict_policy"),
    t("settings.sftp_conflict_ask"),
    t("settings.sftp_conflict_overwrite"),
    t("settings.sftp_conflict_skip"),
    t("settings.sftp_conflict_rename"),
    t("settings.sftp_conflict_resume")
  );
  const showHidden = matchesSettingsQuery(
    query,
    t("settings.cat_sftp"),
    t("settings.sftp_show_hidden"),
    t("settings.sftp_show_hidden_desc")
  );
  const showLocalInSplit = matchesSettingsQuery(
    query,
    t("settings.cat_sftp"),
    t("settings.sftp_show_local_split"),
    t("settings.sftp_show_local_split_desc")
  );
  const showConfirmTransfer = matchesSettingsQuery(
    query,
    t("settings.cat_sftp"),
    t("settings.sftp_confirm_transfer"),
    t("settings.sftp_confirm_transfer_desc")
  );
  const showDoubleClick = matchesSettingsQuery(
    query,
    t("settings.cat_sftp"),
    t("settings.sftp_double_click"),
    t("settings.sftp_double_click_desc"),
    t("settings.sftp_dbl_edit"),
    t("settings.sftp_dbl_transfer")
  );

  if (
    !showPolicy &&
    !showHidden &&
    !showLocalInSplit &&
    !showConfirmTransfer &&
    !showDoubleClick
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<FolderSync className="w-4 h-4" />}
        title={t("settings.cat_sftp")}
        description={t("settings.cat_sftp_desc")}
      />

      <SettingsCard>
        <SettingsRow
          visible={showPolicy}
          title={t("settings.sftp_conflict_policy")}
          description={t("settings.sftp_conflict_policy_desc")}
        >
          <Select
            value={settings.sftpConflictPolicy}
            onChange={(e) =>
              onPatch({ sftpConflictPolicy: e.target.value as SftpConflictPolicy })
            }
            containerClassName="w-52"
          >
            <option value="ASK">{t("settings.sftp_conflict_ask")}</option>
            <option value="OVERWRITE">{t("settings.sftp_conflict_overwrite")}</option>
            <option value="SKIP">{t("settings.sftp_conflict_skip")}</option>
            <option value="RENAME">{t("settings.sftp_conflict_rename")}</option>
            <option value="RESUME">{t("settings.sftp_conflict_resume")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showDoubleClick}
          title={t("settings.sftp_double_click")}
          description={t("settings.sftp_double_click_desc")}
        >
          <Select
            value={settings.sftpDoubleClickFileAction}
            onChange={(e) =>
              onPatch({ sftpDoubleClickFileAction: e.target.value as SftpDoubleClickAction })
            }
            containerClassName="w-52"
          >
            <option value="edit">{t("settings.sftp_dbl_edit")}</option>
            <option value="transfer">{t("settings.sftp_dbl_transfer")}</option>
          </Select>
        </SettingsRow>

        <SettingsRow
          visible={showHidden}
          title={t("settings.sftp_show_hidden")}
          description={t("settings.sftp_show_hidden_desc")}
        >
          <Switch
            checked={settings.sftpShowHiddenFiles}
            onChange={(checked) => onPatch({ sftpShowHiddenFiles: checked })}
            aria-label={t("settings.sftp_show_hidden")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showLocalInSplit}
          title={t("settings.sftp_show_local_split")}
          description={t("settings.sftp_show_local_split_desc")}
        >
          <Switch
            checked={settings.sftpShowLocalInSplit}
            onChange={(checked) => onPatch({ sftpShowLocalInSplit: checked })}
            aria-label={t("settings.sftp_show_local_split")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showConfirmTransfer}
          title={t("settings.sftp_confirm_transfer")}
          description={t("settings.sftp_confirm_transfer_desc")}
        >
          <Switch
            checked={settings.sftpConfirmBeforeTransfer}
            onChange={(checked) => onPatch({ sftpConfirmBeforeTransfer: checked })}
            aria-label={t("settings.sftp_confirm_transfer")}
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
