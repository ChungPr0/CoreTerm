import React from "react";
import { KeyRound, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ConfirmDeleteModal, ModalShell } from "@/shared/ui";
import { useKeyVault } from "../hooks/useKeyVault";
import { KeyGenerateImportForm } from "./KeyGenerateImportForm";
import { KeyCardList } from "./KeyCardList";

interface KeyVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeysChanged: () => void;
}

export const KeyVaultModal: React.FC<KeyVaultModalProps> = ({
  isOpen,
  onClose,
  onKeysChanged,
}) => {
  const { t } = useI18n();
  const vault = useKeyVault({ isOpen, onKeysChanged });

  if (!isOpen) return null;

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={onClose}
        closeDisabled={!!vault.pendingDeleteKey || vault.loading}
        zIndexClass="z-[60]"
        panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-full select-none"
      >
        <div
          data-tauri-drag-region="deep"
          className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100">{t("vault.title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <KeyGenerateImportForm
            mode={vault.mode}
            onModeChange={vault.setMode}
            name={vault.name}
            onNameChange={vault.setName}
            keyType={vault.keyType}
            onKeyTypeChange={vault.setKeyType}
            comment={vault.comment}
            onCommentChange={vault.setComment}
            passphrase={vault.passphrase}
            onPassphraseChange={vault.setPassphrase}
            sourcePath={vault.sourcePath}
            onSourcePathChange={vault.setSourcePath}
            copyManaged={vault.copyManaged}
            onCopyManagedChange={vault.setCopyManaged}
            setDefault={vault.setDefault}
            onSetDefaultChange={vault.setSetDefault}
            loading={vault.loading}
            onSubmit={vault.handleSubmit}
          />

          <KeyCardList
            keys={vault.keys}
            copiedId={vault.copiedId}
            onToggleDefault={vault.handleToggleDefault}
            onCopyPub={vault.handleCopyPub}
            onRequestDelete={vault.openDeleteKeyConfirm}
          />
        </div>
      </ModalShell>

      <ConfirmDeleteModal
        isOpen={!!vault.pendingDeleteKey}
        title={t("vault.delete_confirm")}
        itemName={
          vault.pendingDeleteKey
            ? `${vault.pendingDeleteKey.name} (${vault.pendingDeleteKey.key_type})`
            : ""
        }
        itemDetail={vault.pendingDeleteKey?.private_key_path}
        checkboxLabel={t("vault.delete_disk")}
        checkboxChecked={vault.pendingDeleteDisk}
        checkboxDisabled={!vault.pendingDeleteKey?.file_exists}
        checkboxDisabledHint={t("vault.file_missing")}
        onCheckboxChange={vault.setDeleteDiskInConfirm}
        note={
          vault.pendingDeleteDisk
            ? t("vault.delete_disk_warning")
            : t("vault.delete_keep_disk_note")
        }
        noteTone={vault.pendingDeleteDisk ? "danger" : "neutral"}
        isDeleting={vault.deletingKeyLoading}
        onCancel={vault.closeDeleteKeyConfirm}
        onConfirm={vault.confirmDeleteKey}
      />
    </>
  );
};
