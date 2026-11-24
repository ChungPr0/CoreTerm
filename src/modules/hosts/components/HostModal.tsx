import React, { useState } from "react";
import { Save, Server, X } from "lucide-react";
import type { HostFullConfigDto } from "../types";
import { useI18n } from "@/shared/i18n";
import { Button, ConfirmDeleteModal, Input, ModalShell } from "@/shared/ui";
import { useHostForm } from "../hooks/useHostForm";
import { GroupComboBox } from "./GroupComboBox";
import { HostAuthSection } from "./HostAuthSection";
import { HostOptionsSection } from "./HostOptionsSection";
import { HostPortForwardSection } from "./HostPortForwardSection";
import { PortForwardModal } from "./PortForwardModal";

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
  const [isPfModalOpen, setIsPfModalOpen] = useState(false);
  const [editingPfIdx, setEditingPfIdx] = useState<number | null>(null);

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
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form noValidate onSubmit={form.handleSubmit} className="py-5 pl-5 pr-[15px] space-y-4 overflow-y-auto text-xs">
          <div className="grid grid-cols-3 gap-3">
            <Input
              ref={form.aliasInputRef}
              type="text"
              label={`${t("host.alias")} *`}
              value={form.alias}
              onChange={(e) => form.setAlias(e.target.value)}
            />

            <GroupComboBox
              value={form.groupName}
              onChange={form.setGroupName}
              existingGroups={existingGroups}
              isOpen={form.isGroupMenuOpen}
              onOpenChange={form.setIsGroupMenuOpen}
            />

            <Input
              type="text"
              label={t("host.tags")}
              value={form.tagsInput}
              onChange={(e) => form.setTagsInput(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-6">
              <Input
                ref={form.hostInputRef}
                type="text"
                label={`${t("host.host")} *`}
                value={form.host}
                onChange={(e) => form.setHost(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="col-span-2">
              <Input
                ref={form.portInputRef}
                type="number"
                min={1}
                max={65535}
                label={`${t("host.port")} *`}
                value={form.port}
                onChange={(e) => form.setPort(Number(e.target.value))}
                className="font-mono"
              />
            </div>

            <div className="col-span-4">
              <Input
                ref={form.usernameInputRef}
                type="text"
                label={`${t("host.username")} *`}
                value={form.username}
                onChange={(e) => form.setUsername(e.target.value)}
                className="font-mono"
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
            onToggleRule={form.handleToggleRule}
            onRequestDeleteRule={form.setPendingDeleteRuleIdx}
            onOpenAddRule={() => {
              setEditingPfIdx(null);
              setIsPfModalOpen(true);
            }}
            onOpenEditRule={(idx) => {
              setEditingPfIdx(idx);
              setIsPfModalOpen(true);
            }}
          />

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={form.isSaving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              {t("common.save")}
            </Button>
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

      <PortForwardModal
        isOpen={isPfModalOpen}
        initialRule={editingPfIdx !== null ? form.forwards[editingPfIdx] : null}
        existingRules={form.forwards}
        editingIndex={editingPfIdx}
        onClose={() => {
          setIsPfModalOpen(false);
          setEditingPfIdx(null);
        }}
        onSave={(rule) => {
          if (editingPfIdx !== null) {
            form.handleUpdateRule(editingPfIdx, rule);
          } else {
            form.handleAddRule(rule);
          }
          setIsPfModalOpen(false);
          setEditingPfIdx(null);
        }}
      />
    </>
  );
};
