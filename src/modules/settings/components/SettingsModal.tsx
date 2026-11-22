import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FolderSync,
  Globe,
  MousePointerClick,
  Save,
  Settings,
  X,
} from "lucide-react";
import {
  clampLaunchCols,
  clampLaunchRows,
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_SHELL_ID,
  LAUNCH_COLS_DEFAULT,
  LAUNCH_ROWS_DEFAULT,
} from "@/shared/defaults";
import { type Locale, useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";
import {
  ActionModal,
  Button,
  ConfirmDeleteModal,
  ModalShell,
  SegmentedControl,
  Select,
  Switch,
} from "@/shared/ui";
import {
  formatShellArgs,
  mergeShells,
  resolveDefaultShell,
  sessionApi,
  useShellsStore,
} from "@/modules/terminal";
import { hasSettingsChanges } from "../settingsDiff";
import type { AppSettingsValues } from "../types";
import { CustomShellsSection } from "./CustomShellsSection";
import { DefaultShellSection } from "./DefaultShellSection";
import { LaunchSizeSection } from "./LaunchSizeSection";

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettingsValues;
  shellProfiles?: ShellProfile[];
  onClose: () => void;
  onSave: (next: AppSettingsValues) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  shellProfiles = [],
  onClose,
  onSave,
}) => {
  const { locale, setLocale, t } = useI18n();
  const detectedFromStore = useShellsStore((s) => s.shells);
  const detectShells = useShellsStore((s) => s.detectShells);

  const [cols, setCols] = useState<number>(settings.launchCols);
  const [rows, setRows] = useState<number>(settings.launchRows);
  const [sftpConflictPolicy, setSftpConflictPolicy] =
    useState<SftpConflictPolicy>(settings.sftpConflictPolicy ?? DEFAULT_CONFLICT_POLICY);
  const [customShells, setCustomShells] = useState<ShellProfile[]>(
    settings.customShells ?? []
  );
  const [defaultShellId, setDefaultShellId] = useState<string>(
    settings.defaultShellId || DEFAULT_SHELL_ID
  );
  const [isScanning, setIsScanning] = useState(false);
  const [launchSizeResetDone, setLaunchSizeResetDone] = useState(false);
  const resetFeedbackTimerRef = useRef<number | null>(null);
  const [contextMenuOriginal, setContextMenuOriginal] = useState(false);
  const [contextMenuDraft, setContextMenuDraft] = useState(false);
  const [deletingShell, setDeletingShell] = useState<ShellProfile | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [hasDirtyShellEditor, setHasDirtyShellEditor] = useState(false);

  const isDefaultLaunchSize =
    cols === LAUNCH_COLS_DEFAULT && rows === LAUNCH_ROWS_DEFAULT;

  const clearResetFeedback = () => {
    if (resetFeedbackTimerRef.current !== null) {
      window.clearTimeout(resetFeedbackTimerRef.current);
      resetFeedbackTimerRef.current = null;
    }
    setLaunchSizeResetDone(false);
  };

  useEffect(() => {
    return () => {
      if (resetFeedbackTimerRef.current !== null) {
        window.clearTimeout(resetFeedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    sessionApi
      .contextMenuGetStatus()
      .then((status) => {
        setContextMenuOriginal(status);
        setContextMenuDraft(status);
      })
      .catch(() => {});
  }, [isOpen]);

  const systemShells = useMemo(() => {
    if (detectedFromStore.length > 0) return detectedFromStore;
    const savedCustomIds = new Set((settings.customShells ?? []).map((c) => c.id));
    return shellProfiles.filter((s) => !savedCustomIds.has(s.id));
  }, [detectedFromStore, shellProfiles, settings.customShells]);

  const availableShells = useMemo(
    () => mergeShells(systemShells, customShells),
    [systemShells, customShells]
  );

  const effectiveDefaultShell = useMemo(
    () => resolveDefaultShell(availableShells, defaultShellId),
    [availableShells, defaultShellId]
  );

  const initialEffectiveDefaultShellId = useMemo(() => {
    const initialAvailable = mergeShells(systemShells, settings.customShells ?? []);
    return (
      resolveDefaultShell(initialAvailable, settings.defaultShellId || DEFAULT_SHELL_ID)?.id ??
      ""
    );
  }, [systemShells, settings.customShells, settings.defaultShellId]);

  const isDirty = useMemo(
    () =>
      hasSettingsChanges(settings, {
        cols,
        rows,
        sftpConflictPolicy,
        effectiveDefaultShellId: effectiveDefaultShell?.id ?? "",
        initialEffectiveDefaultShellId,
        customShells,
        contextMenuDraft,
        contextMenuOriginal,
        hasDirtyShellEditor,
      }),
    [
      settings,
      cols,
      rows,
      sftpConflictPolicy,
      effectiveDefaultShell,
      initialEffectiveDefaultShellId,
      customShells,
      contextMenuDraft,
      contextMenuOriginal,
      hasDirtyShellEditor,
    ]
  );

  const hasChildConfirmModal = deletingShell !== null || showDiscardConfirm;

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    clearResetFeedback();
    setDeletingShell(null);
    setShowDiscardConfirm(false);
    setHasDirtyShellEditor(false);
    if (!isOpen) return;
    setCols(settings.launchCols);
    setRows(settings.launchRows);
    setSftpConflictPolicy(settings.sftpConflictPolicy ?? DEFAULT_CONFLICT_POLICY);
    setCustomShells(settings.customShells ?? []);
    setDefaultShellId(settings.defaultShellId || DEFAULT_SHELL_ID);
  }, [isOpen, settings]);

  const handleResetLaunchSize = () => {
    if (isDefaultLaunchSize) return;
    setCols(LAUNCH_COLS_DEFAULT);
    setRows(LAUNCH_ROWS_DEFAULT);
    setLaunchSizeResetDone(true);
    if (resetFeedbackTimerRef.current !== null) {
      window.clearTimeout(resetFeedbackTimerRef.current);
    }
    resetFeedbackTimerRef.current = window.setTimeout(() => {
      setLaunchSizeResetDone(false);
      resetFeedbackTimerRef.current = null;
    }, 1400);
  };

  const handleRescan = async () => {
    setIsScanning(true);
    try {
      await detectShells(true);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validCols = clampLaunchCols(cols);
    const validRows = clampLaunchRows(rows);
    const selectedProfile = effectiveDefaultShell ?? undefined;
    if (contextMenuDraft !== contextMenuOriginal) {
      sessionApi.contextMenuSetEnabled(contextMenuDraft).catch(() => {});
      setContextMenuOriginal(contextMenuDraft);
    }
    onSave({
      launchCols: validCols,
      launchRows: validRows,
      sftpConflictPolicy,
      defaultShellId: selectedProfile?.id ?? "",
      defaultShellProfile: selectedProfile,
      customShells,
    });
    onClose();
  };

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={handleRequestClose}
        closeDisabled={hasChildConfirmModal}
        panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-hidden flex flex-col text-xs select-none"
      >
        <div
          data-tauri-drag-region="deep"
          className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">{t("settings.title")}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={handleRequestClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>{t("settings.lang")}</span>
            </label>
            <SegmentedControl<Locale>
              value={locale}
              onChange={setLocale}
              options={[
                { value: "vi", label: t("settings.lang_vi") },
                { value: "en", label: t("settings.lang_en") },
              ]}
            />
          </div>

          <LaunchSizeSection
            cols={cols}
            rows={rows}
            isDefaultLaunchSize={isDefaultLaunchSize}
            launchSizeResetDone={launchSizeResetDone}
            onChangeCols={(next) => {
              clearResetFeedback();
              setCols(next);
            }}
            onChangeRows={(next) => {
              clearResetFeedback();
              setRows(next);
            }}
            onResetLaunchSize={handleResetLaunchSize}
          />

          <DefaultShellSection
            availableShells={availableShells}
            effectiveDefaultShellId={effectiveDefaultShell?.id ?? ""}
            isScanning={isScanning}
            onChangeDefaultShellId={setDefaultShellId}
            onRescan={() => void handleRescan()}
          />

          <CustomShellsSection
            customShells={customShells}
            onChange={setCustomShells}
            onFirstAdd={(profile) => {
              if (availableShells.length === 0) setDefaultShellId(profile.id);
            }}
            onRequestDelete={setDeletingShell}
            onEditorDirtyChange={setHasDirtyShellEditor}
          />

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-300 font-medium min-w-0">
              <FolderSync className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate" title={t("settings.sftp_conflict_policy")}>
                {t("settings.sftp_conflict_policy")}
              </span>
            </div>
            <Select
              value={sftpConflictPolicy}
              onChange={(e) => setSftpConflictPolicy(e.target.value as SftpConflictPolicy)}
              containerClassName="w-48 shrink-0"
            >
              <option value="ASK">{t("settings.sftp_conflict_ask")}</option>
              <option value="OVERWRITE">{t("settings.sftp_conflict_overwrite")}</option>
              <option value="SKIP">{t("settings.sftp_conflict_skip")}</option>
              <option value="RENAME">{t("settings.sftp_conflict_rename")}</option>
              <option value="RESUME">{t("settings.sftp_conflict_resume")}</option>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-300 font-medium min-w-0">
              <MousePointerClick className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate" title={t("settings.context_menu_title")}>
                {t("settings.context_menu_title")}
              </span>
            </div>
            <Switch
              checked={contextMenuDraft}
              onChange={() => setContextMenuDraft((prev) => !prev)}
              aria-label={t("settings.context_menu_title")}
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <Button variant="secondary" onClick={handleRequestClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              type="submit"
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              {t("common.save")}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ConfirmDeleteModal
        isOpen={deletingShell !== null}
        title={t("settings.shell_delete_title")}
        itemName={deletingShell?.name ?? ""}
        itemDetail={
          deletingShell
            ? formatShellArgs(deletingShell.args)
              ? `${deletingShell.executable} ${formatShellArgs(deletingShell.args)}`
              : deletingShell.executable
            : undefined
        }
        onCancel={() => setDeletingShell(null)}
        onConfirm={() => {
          if (!deletingShell) return;
          setCustomShells((prev) => prev.filter((c) => c.id !== deletingShell.id));
          setDeletingShell(null);
        }}
      />

      <ActionModal
        isOpen={showDiscardConfirm}
        onClose={() => setShowDiscardConfirm(false)}
        title={t("settings.discard_title")}
        icon={<AlertTriangle className="h-4 w-4" />}
        iconTone="warning"
        size="sm"
        confirmLabel={t("settings.discard_confirm")}
        confirmVariant="danger"
        confirmIcon={<X className="h-3.5 w-3.5" />}
        cancelLabel={t("settings.discard_keep")}
        confirmAutoFocus
        onConfirm={() => {
          setShowDiscardConfirm(false);
          onClose();
        }}
      >
        <p className="text-xs text-slate-300 leading-relaxed">{t("settings.discard_desc")}</p>
      </ActionModal>
    </>
  );
};
