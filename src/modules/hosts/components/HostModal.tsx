import React from "react";
import { Save, Server, X } from "lucide-react";
import type { HostFullConfigDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { ConfirmDeleteModal, ModalShell } from "@/shared/ui";
import { useHostForm } from "../hooks/useHostForm";
import { GroupComboBox } from "./GroupComboBox";
import { HostAuthSection } from "./HostAuthSection";
import { HostOptionsSection } from "./HostOptionsSection";
import { HostPortForwardSection } from "./HostPortForwardSection";

interface HostModalProps {
  isOpen: boolean;
  editingHost: HostFullConfigDto | null;
  initialGroupName?: string;
  existingGroups: string[];
  keysVersion?: number;
  onOpenKeyVault?: () => void;
  onClose: () => void;
  onSaved: (saved: HostFullConfigDto) => void;
}

export const HostModal: React.FC<HostModalProps> = ({
  isOpen,
  editingHost,
  initialGroupName,
  existingGroups,
  keysVersion = 0,
  onOpenKeyVault,
  onClose,
  onSaved,
}) => {
  const { t } = useI18n();
  const form = useHostForm({
    isOpen,
    editingHost,
    initialGroupName,
    keysVersion,
    onClose,
    onSaved,
  });

  if (!isOpen) return null;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        closeDisabled={form.isGroupMenuOpen || !!form.pendingRule || form.isSaving}
        panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-full select-none"
      >
        <div
          data-tauri-drag-region="deep"
          className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">
              {editingHost ? t("host.edit") : t("host.create")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form noValidate onSubmit={form.handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.alias")} *
              </label>
              <input
                ref={form.aliasInputRef}
                type="text"
                value={form.alias}
                onChange={(e) => form.setAlias(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>

            <GroupComboBox
              value={form.groupName}
              onChange={form.setGroupName}
              existingGroups={existingGroups}
              isOpen={form.isGroupMenuOpen}
              onOpenChange={form.setIsGroupMenuOpen}
            />

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.tags")}
              </label>
              <input
                type="text"
                value={form.tagsInput}
                onChange={(e) => form.setTagsInput(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.host")} *
              </label>
              <input
                ref={form.hostInputRef}
                type="text"
                value={form.host}
                onChange={(e) => form.setHost(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.port")}
              </label>
              <input
                ref={form.portInputRef}
                type="number"
                min={1}
                max={65535}
                value={form.port}
                onChange={(e) => form.setPort(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>

            <div className="col-span-4">
              <label className="block text-slate-300 font-medium mb-1">
                {t("host.username")} *
              </label>
              <input
                ref={form.usernameInputRef}
                type="text"
                value={form.username}
                onChange={(e) => form.setUsername(e.target.value)}
                className="w-full h-8 px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
          </div>

          <HostAuthSection
            authMethod={form.authMethod}
            onAuthMethodChange={form.setAuthMethod}
            passwordMode={form.passwordMode}
            onPasswordModeChange={form.setPasswordMode}
            password={form.password}
            onPasswordChange={form.setPassword}
            passwordInputRef={form.passwordInputRef}
            keyPathInputRef={form.keyPathInputRef}
            hasSavedPassword={editingHost?.has_saved_password}
            savedKeys={form.savedKeys}
            selectedKeyId={form.selectedKeyId}
            onSelectSavedKey={form.handleSelectSavedKey}
            privateKeyPath={form.privateKeyPath}
            onPrivateKeyPathChange={form.setPrivateKeyPath}
            onOpenKeyVault={onOpenKeyVault}
            autoReconnect={form.autoReconnect}
            onAutoReconnectChange={form.setAutoReconnect}
            reconnectIntervalSec={form.reconnectIntervalSec}
            onReconnectIntervalSecChange={form.setReconnectIntervalSec}
          />

          <HostOptionsSection
            serverAliveInterval={form.serverAliveInterval}
            onServerAliveIntervalChange={form.setServerAliveInterval}
            strictHostKeyChecking={form.strictHostKeyChecking}
            onStrictHostKeyCheckingChange={form.setStrictHostKeyChecking}
            startupCommand={form.startupCommand}
            onStartupCommandChange={form.setStartupCommand}
            compression={form.compression}
            onCompressionChange={form.setCompression}
            forwardAgent={form.forwardAgent}
            onForwardAgentChange={form.setForwardAgent}
          />

          <HostPortForwardSection
            forwards={form.forwards}
            onAddRule={form.handleAddRule}
            onToggleRule={form.handleToggleRule}
            onRequestDeleteRule={form.setPendingDeleteRuleIdx}
          />

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={form.isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{form.isSaving ? t("common.loading") : t("common.save")}</span>
            </button>
          </div>
        </form>
      </ModalShell>

      <ConfirmDeleteModal
        isOpen={!!form.pendingRule}
        title={t("forward.delete_confirm")}
        itemName={
          form.pendingRule
            ? `${form.pendingRule.label} (${form.pendingRule.forward_type})`
            : ""
        }
        itemDetail={
          form.pendingRule
            ? `${form.pendingRule.bind_address}:${form.pendingRule.bind_port}${
                form.pendingRule.forward_type !== "DYNAMIC"
                  ? ` -> ${form.pendingRule.target_host}:${form.pendingRule.target_port}`
                  : ""
              }`
            : undefined
        }
        onCancel={() => form.setPendingDeleteRuleIdx(null)}
        onConfirm={form.confirmRemoveRule}
      />
    </>
  );
};
