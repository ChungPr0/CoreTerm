import React, { Suspense, lazy, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ShellProfile } from "@/shared/types/ipc";
import type { DeletePromptState, HostFullConfigDto } from "@/modules/hosts";
import type { HostProfileSummaryDto, PortProbeResultDto } from "@/modules/hosts";
import type { SftpAuthPromptEventDto, SftpHostKeyPromptEventDto } from "@/modules/sftp";
import type { SessionAuthPromptEventDto, SessionHostKeyPromptEventDto } from "@/modules/terminal";
import { useI18n } from "@/shared/i18n";
import { ActionModal, useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";

export type CloseTabsPromptState =
  | { mode: "window"; count: number }
  | { mode: "others"; keepTabId: string; count: number };

const loadHostModal = () => import("@/modules/hosts/components/HostModal");
const loadKeyVaultModal = () => import("@/modules/keys/components/KeyVaultModal");
const loadAuthPromptModal = () => import("@/modules/terminal/components/AuthPromptModal");
const loadPortConflictModal = () => import("@/modules/hosts/components/PortConflictModal");
const loadCommandPalette = () => import("@/modules/workspace/components/CommandPalette");
const loadConfirmDeleteModal = () => import("@/shared/ui/ConfirmDeleteModal");
const loadGroupModal = () => import("@/modules/hosts/components/GroupModal");
const loadSftpPane = () => import("@/modules/sftp/components/SftpPane");

export const APP_PRELOADERS = [
  loadHostModal,
  loadKeyVaultModal,
  loadAuthPromptModal,
  loadPortConflictModal,
  loadCommandPalette,
  loadConfirmDeleteModal,
  loadGroupModal,
  loadSftpPane,
];

const HostModal = lazy(() => loadHostModal().then((m) => ({ default: m.HostModal })));
const KeyVaultModal = lazy(() => loadKeyVaultModal().then((m) => ({ default: m.KeyVaultModal })));
const AuthPromptModal = lazy(() =>
  loadAuthPromptModal().then((m) => ({ default: m.AuthPromptModal }))
);
const PortConflictModal = lazy(() =>
  loadPortConflictModal().then((m) => ({ default: m.PortConflictModal }))
);
const CommandPalette = lazy(() =>
  loadCommandPalette().then((m) => ({ default: m.CommandPalette }))
);
const ConfirmDeleteModal = lazy(() =>
  loadConfirmDeleteModal().then((m) => ({ default: m.ConfirmDeleteModal }))
);
const GroupModal = lazy(() => loadGroupModal().then((m) => ({ default: m.GroupModal })));

interface AppModalsProps {
  allProfiles: HostProfileSummaryDto[];
  dbGroups: string[];
  existingGroups: string[];
  isHostModalOpen: boolean;
  editingHost: HostFullConfigDto | null;
  hostInitialGroup?: string;
  isGroupModalOpen: boolean;
  isCreatingGroup: boolean;
  onCloseHostModal: () => void;
  onCloseGroupModal: () => void;
  onCreateGroup: (name: string) => Promise<void>;
  onHostSaved: (saved: HostFullConfigDto) => Promise<void>;
  onKeysChanged: () => void;

  isVaultOpen: boolean;
  keysVersion: number;
  onOpenVault: () => void;
  onCloseVault: () => void;

  isAppElevated: boolean;
  shellProfiles: ShellProfile[];

  isPaletteOpen: boolean;
  onClosePalette: () => void;
  onSelectHost: (host: HostProfileSummaryDto) => void;
  onSelectShell: (profile: ShellProfile, asAdmin?: boolean) => void;
  onOpenSftpTab: (host: HostProfileSummaryDto) => void;
  onOpenSettings: () => void;

  authPrompt: SessionAuthPromptEventDto | SftpAuthPromptEventDto | null;
  authPromptSource: "pty" | "sftp";
  hostKeyPrompt: SessionHostKeyPromptEventDto | SftpHostKeyPromptEventDto | null;
  hostKeySource: "pty" | "sftp";
  onCloseAuthPrompt: () => void;
  onCloseHostKeyPrompt: () => void;
  onAbortAuthTab?: (tabId: string, source: "pty" | "sftp") => void;
  onReconnectTab: (tabId: string) => void;
  onCancelAutoReconnect?: (tabId: string) => void;

  portConflicts: PortProbeResultDto[];
  onSkipPortConflicts: () => void;
  onAbortPortConflicts: () => void;

  deletePrompt: DeletePromptState | null;
  onClearDeletePrompt: () => void;

  closeTabsPrompt: CloseTabsPromptState | null;
  onCancelCloseTabsPrompt: () => void;
  onConfirmCloseTabsPrompt: () => void;
}

export const AppModals: React.FC<AppModalsProps> = ({
  allProfiles,
  dbGroups,
  existingGroups,
  isHostModalOpen,
  editingHost,
  hostInitialGroup,
  isGroupModalOpen,
  isCreatingGroup,
  onCloseHostModal,
  onCloseGroupModal,
  onCreateGroup,
  onHostSaved,
  onKeysChanged,
  isVaultOpen,
  keysVersion,
  onOpenVault,
  onCloseVault,
  isAppElevated,
  shellProfiles,
  isPaletteOpen,
  onClosePalette,
  onSelectHost,
  onSelectShell,
  onOpenSftpTab,
  onOpenSettings,
  authPrompt,
  authPromptSource,
  hostKeyPrompt,
  hostKeySource,
  onCloseAuthPrompt,
  onCloseHostKeyPrompt,
  onAbortAuthTab,
  onReconnectTab,
  onCancelAutoReconnect,
  portConflicts,
  onSkipPortConflicts,
  onAbortPortConflicts,
  deletePrompt,
  onClearDeletePrompt,
  closeTabsPrompt,
  onCancelCloseTabsPrompt,
  onConfirmCloseTabsPrompt,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <Suspense fallback={null}>
        {isHostModalOpen && (
          <HostModal
            isOpen={isHostModalOpen}
            editingHost={editingHost}
            initialGroupName={hostInitialGroup}
            existingGroups={existingGroups}
            keysVersion={keysVersion}
            onOpenKeyVault={onOpenVault}
            onClose={onCloseHostModal}
            onSaved={onHostSaved}
          />
        )}

        {isVaultOpen && (
          <KeyVaultModal
            isOpen={isVaultOpen}
            onClose={onCloseVault}
            onKeysChanged={onKeysChanged}
          />
        )}

        {(authPrompt || hostKeyPrompt) && (
          <AuthPromptModal
            authPrompt={authPrompt}
            authPromptSource={authPromptSource}
            hostKeyPrompt={hostKeyPrompt}
            hostKeyPromptSource={hostKeySource}
            onCloseAuth={onCloseAuthPrompt}
            onCloseHostKey={onCloseHostKeyPrompt}
            onAbortTab={onAbortAuthTab}
            onReconnectTab={onReconnectTab}
            onCancelAutoReconnect={onCancelAutoReconnect}
          />
        )}

        {portConflicts.length > 0 && (
          <PortConflictModal
            conflicts={portConflicts}
            onSkipAndConnect={onSkipPortConflicts}
            onAbort={onAbortPortConflicts}
          />
        )}

        {isPaletteOpen && (
          <CommandPalette
            isOpen={isPaletteOpen}
            isAppElevated={isAppElevated}
            profiles={allProfiles}
            shellProfiles={shellProfiles}
            onClose={onClosePalette}
            onSelectHost={onSelectHost}
            onSelectShell={onSelectShell}
            onOpenSftp={onOpenSftpTab}
            onOpenSettings={onOpenSettings}
          />
        )}

        {deletePrompt && (
          <ConfirmDeleteModal
            isOpen={!!deletePrompt}
            title={deletePrompt.title}
            itemName={deletePrompt.itemName}
            itemDetail={deletePrompt.itemDetail}
            note={deletePrompt.note}
            noteTone={deletePrompt.noteTone}
            confirmLabel={deletePrompt.confirmLabel}
            isDeleting={isDeleting}
            onCancel={() => {
              if (!isDeleting) onClearDeletePrompt();
            }}
            onConfirm={async () => {
              if (isDeleting) return;
              setIsDeleting(true);
              try {
                await deletePrompt.onConfirm();
                onClearDeletePrompt();
              } catch (err) {
                alert.error(formatLocalizedError(err, t));
              } finally {
                setIsDeleting(false);
              }
            }}
          />
        )}

        {isGroupModalOpen && (
          <GroupModal
            isOpen={isGroupModalOpen}
            existingGroups={dbGroups}
            isSubmitting={isCreatingGroup}
            onClose={onCloseGroupModal}
            onCreateGroup={onCreateGroup}
          />
        )}

        <ActionModal
          isOpen={closeTabsPrompt !== null}
          onClose={onCancelCloseTabsPrompt}
          title={
            closeTabsPrompt?.mode === "window"
              ? t("window.close_multi_tabs_title")
              : t("window.close_other_tabs_title")
          }
          icon={<AlertTriangle className="h-4 w-4" />}
          iconTone="warning"
          size="sm"
          confirmLabel={t("window.close_all_btn")}
          confirmVariant="danger"
          confirmIcon={<X className="h-3.5 w-3.5" />}
          confirmAutoFocus
          onConfirm={onConfirmCloseTabsPrompt}
        >
          <p className="text-xs text-slate-300 leading-relaxed">
            {closeTabsPrompt?.mode === "window"
              ? t("window.close_multi_tabs_desc", { count: closeTabsPrompt.count })
              : t("window.close_other_tabs_desc", {
                  count: closeTabsPrompt?.count ?? 0,
                })}
          </p>
        </ActionModal>
    </Suspense>
  );
};
