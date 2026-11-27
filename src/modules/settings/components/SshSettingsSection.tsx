import React, { useEffect, useRef, useState } from "react";
import { KeyRound, Shield } from "lucide-react";
import {
  clampSshKeepAlive,
  clampSshPort,
  clampSshReconnectInterval,
  SSH_DEFAULT_USERNAME,
  SSH_KEEPALIVE_MAX,
  SSH_KEEPALIVE_MIN,
  SSH_RECONNECT_MAX,
  SSH_RECONNECT_MIN,
} from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import type { StrictHostKeyChecking } from "@/shared/types/ipc";
import { Button, Input, Select, Switch, useAlert } from "@/shared/ui";
import type { AppSettingsValues } from "../types";
import {
  matchesSettingsQuery,
  SettingsCard,
  SettingsNumberInput,
  SettingsRow,
  SettingsSectionFooter,
  SettingsSectionHeader,
} from "./SettingsPrimitives";

interface SshSettingsSectionProps {
  settings: AppSettingsValues;
  query: string;
  onPatch: (patch: Partial<AppSettingsValues>) => void;
  onOpenVault?: () => void;
  onResetSection?: () => void;
}

export const SshSettingsSection: React.FC<SshSettingsSectionProps> = ({
  settings,
  query,
  onPatch,
  onOpenVault,
  onResetSection,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [usernameDraft, setUsernameDraft] = useState(settings.sshDefaultUsername);
  const usernameFocusedRef = useRef(false);

  useEffect(() => {
    if (!usernameFocusedRef.current) {
      setUsernameDraft(settings.sshDefaultUsername);
    }
  }, [settings.sshDefaultUsername]);

  const handleUsernameChange = (raw: string) => {
    setUsernameDraft(raw);
    const trimmed = raw.trim();
    if (
      trimmed &&
      !trimmed.startsWith("-") &&
      !/\s/.test(trimmed) &&
      !/[\x00-\x1F\x7F]/.test(trimmed) &&
      trimmed !== settings.sshDefaultUsername
    ) {
      onPatch({ sshDefaultUsername: trimmed });
    }
  };

  const commitUsername = () => {
    const trimmed = usernameDraft.trim();
    if (!trimmed) {
      setUsernameDraft(SSH_DEFAULT_USERNAME);
      onPatch({ sshDefaultUsername: SSH_DEFAULT_USERNAME });
      return;
    }
    if (trimmed.startsWith("-")) {
      alert.error(t("errors.host_username_invalid_hyphen"));
      setUsernameDraft(settings.sshDefaultUsername);
      return;
    }
    if (/\s/.test(trimmed) || /[\x00-\x1F\x7F]/.test(trimmed)) {
      alert.error(t("errors.host_username_invalid_chars"));
      setUsernameDraft(settings.sshDefaultUsername);
      return;
    }
    setUsernameDraft(trimmed);
    if (trimmed !== settings.sshDefaultUsername) {
      onPatch({ sshDefaultUsername: trimmed });
    }
  };

  const showUser = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_username"),
    t("host.username")
  );
  const showPort = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_port"),
    t("host.port")
  );
  const showKeepAlive = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_keepalive"),
    t("ssh.keepalive")
  );
  const showHostChecking = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_host_checking"),
    t("ssh.host_checking"),
    t("ssh.accept_new"),
    t("ssh.strict_yes"),
    t("ssh.strict_no")
  );
  const showCompression = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_compression"),
    t("ssh.compression")
  );
  const showForwardAgent = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_forward_agent"),
    t("ssh.forward_agent")
  );
  const showAutoReconnect = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_auto_reconnect"),
    t("session.auto_reconnect")
  );
  const showReconnectInterval = matchesSettingsQuery(
    query,
    t("settings.cat_ssh"),
    t("settings.ssh_default_reconnect_interval"),
    t("session.reconnect_interval")
  );
  const showVault =
    Boolean(onOpenVault) &&
    matchesSettingsQuery(
      query,
      t("settings.cat_ssh"),
      t("vault.title"),
      t("settings.ssh_key_vault_desc")
    );

  if (
    !showUser &&
    !showPort &&
    !showKeepAlive &&
    !showHostChecking &&
    !showCompression &&
    !showForwardAgent &&
    !showAutoReconnect &&
    !showReconnectInterval &&
    !showVault
  ) {
    return null;
  }

  return (
    <section className="space-y-4">
      <SettingsSectionHeader
        icon={<Shield className="w-4 h-4" />}
        title={t("settings.cat_ssh")}
        description={t("settings.cat_ssh_desc")}
      />

      <SettingsCard title={t("settings.group_connection")}>
        <SettingsRow
          visible={showUser}
          title={t("settings.ssh_default_username")}
        >
          <Input
            type="text"
            value={usernameDraft}
            onFocus={() => {
              usernameFocusedRef.current = true;
            }}
            onChange={(e) => handleUsernameChange(e.target.value)}
            onBlur={() => {
              usernameFocusedRef.current = false;
              commitUsername();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitUsername();
              }
            }}
            className="font-mono"
            containerClassName="w-52"
          />
        </SettingsRow>

        <SettingsRow
          visible={showPort}
          title={t("settings.ssh_default_port")}
        >
          <SettingsNumberInput
            value={settings.sshDefaultPort}
            min={1}
            max={65535}
            clamp={clampSshPort}
            onCommit={(next) => onPatch({ sshDefaultPort: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showKeepAlive}
          title={t("settings.ssh_default_keepalive")}
          description={t("settings.ssh_default_keepalive_desc")}
        >
          <SettingsNumberInput
            value={settings.sshDefaultKeepAlive}
            min={SSH_KEEPALIVE_MIN}
            max={SSH_KEEPALIVE_MAX}
            clamp={clampSshKeepAlive}
            onCommit={(next) => onPatch({ sshDefaultKeepAlive: next })}
          />
        </SettingsRow>

        <SettingsRow
          visible={showHostChecking}
          title={t("settings.ssh_default_host_checking")}
          description={
            settings.sshDefaultStrictHostKey === "NO"
              ? t("settings.ssh_default_host_checking_no_warn")
              : undefined
          }
        >
          <Select
            value={settings.sshDefaultStrictHostKey}
            onChange={(e) =>
              onPatch({
                sshDefaultStrictHostKey: e.target.value as StrictHostKeyChecking,
              })
            }
            containerClassName="w-52"
          >
            <option value="ACCEPT_NEW">{t("ssh.accept_new")}</option>
            <option value="YES">{t("ssh.strict_yes")}</option>
            <option value="NO">{t("ssh.strict_no")}</option>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.group_behavior")}>
        <SettingsRow
          visible={showCompression}
          title={t("settings.ssh_default_compression")}
        >
          <Switch
            checked={settings.sshDefaultCompression}
            onChange={(checked) => onPatch({ sshDefaultCompression: checked })}
            aria-label={t("settings.ssh_default_compression")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showForwardAgent}
          title={t("settings.ssh_default_forward_agent")}
          description={t("settings.ssh_default_forward_agent_desc")}
        >
          <Switch
            checked={settings.sshDefaultForwardAgent}
            onChange={(checked) => onPatch({ sshDefaultForwardAgent: checked })}
            aria-label={t("settings.ssh_default_forward_agent")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showAutoReconnect}
          title={t("settings.ssh_default_auto_reconnect")}
          description={t("settings.ssh_default_auto_reconnect_desc")}
        >
          <Switch
            checked={settings.sshDefaultAutoReconnect}
            onChange={(checked) => onPatch({ sshDefaultAutoReconnect: checked })}
            aria-label={t("settings.ssh_default_auto_reconnect")}
          />
        </SettingsRow>

        <SettingsRow
          visible={showReconnectInterval}
          title={t("settings.ssh_default_reconnect_interval")}
        >
          <SettingsNumberInput
            value={settings.sshDefaultReconnectIntervalSec}
            min={SSH_RECONNECT_MIN}
            max={SSH_RECONNECT_MAX}
            clamp={clampSshReconnectInterval}
            onCommit={(next) => onPatch({ sshDefaultReconnectIntervalSec: next })}
          />
        </SettingsRow>
      </SettingsCard>

      {showVault && onOpenVault && (
        <SettingsCard>
          <SettingsRow
            title={t("vault.title")}
            description={t("settings.ssh_key_vault_desc")}
          >
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<KeyRound className="w-3.5 h-3.5 text-emerald-400" />}
              onClick={onOpenVault}
            >
              {t("host.open_vault")}
            </Button>
          </SettingsRow>
        </SettingsCard>
      )}

      <SettingsSectionFooter
        visible={!query.trim()}
        onResetSection={onResetSection}
      />
    </section>
  );
};
