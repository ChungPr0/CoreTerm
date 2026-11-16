import React, { useEffect, useMemo, useState } from "react";
import {
  FolderSync,
  Globe,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Terminal as TerminalIcon,
  X,
} from "lucide-react";
import {
  clampLaunchCols,
  clampLaunchRows,
  DEFAULT_CONFLICT_POLICY,
  DEFAULT_SHELL_ID,
  LAUNCH_COLS_DEFAULT,
  LAUNCH_COLS_MAX,
  LAUNCH_COLS_MIN,
  LAUNCH_ROWS_DEFAULT,
  LAUNCH_ROWS_MAX,
  LAUNCH_ROWS_MIN,
} from "@/shared/defaults";
import { type Locale, useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy, ShellProfile } from "@/shared/types/ipc";
import { ModalShell } from "@/shared/ui";
import {
  mergeShells,
  resolveDefaultShell,
  useShellsStore,
} from "@/modules/terminal";
import type { AppSettingsValues } from "../types";
import { CustomShellsSection } from "./CustomShellsSection";

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
    useState<SftpConflictPolicy>(settings.sftpConflictPolicy ?? "ASK");
  const [customShells, setCustomShells] = useState<ShellProfile[]>(
    settings.customShells ?? []
  );
  const [defaultShellId, setDefaultShellId] = useState<string>(
    settings.defaultShellId || DEFAULT_SHELL_ID
  );
  const [isScanning, setIsScanning] = useState(false);

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

  useEffect(() => {
    if (!isOpen) return;
    setCols(settings.launchCols);
    setRows(settings.launchRows);
    setSftpConflictPolicy(settings.sftpConflictPolicy ?? DEFAULT_CONFLICT_POLICY);
    setCustomShells(settings.customShells ?? []);
    setDefaultShellId(settings.defaultShellId || DEFAULT_SHELL_ID);
  }, [isOpen, settings]);

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

  const handleLangChange = (next: Locale) => {
    setLocale(next);
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-full overflow-hidden flex flex-col text-xs select-none"
    >
        <div
          data-tauri-drag-region="deep"
          className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">
              {t("settings.title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto">
          {/* Language selection */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-slate-300 font-semibold">
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>{t("settings.lang")}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleLangChange("vi")}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors ${
                  locale === "vi"
                    ? "bg-sky-500/15 border-sky-500 text-sky-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("settings.lang_vi")}
              </button>
              <button
                type="button"
                onClick={() => handleLangChange("en")}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors ${
                  locale === "en"
                    ? "bg-sky-500/15 border-sky-500 text-sky-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t("settings.lang_en")}
              </button>
            </div>
          </div>

          {/* Launch size (columns x rows) */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                <Monitor className="w-3.5 h-3.5 text-sky-400" />
                <span>{t("settings.launch_size")}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCols(LAUNCH_COLS_DEFAULT);
                  setRows(LAUNCH_ROWS_DEFAULT);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
              >
                <RotateCcw className="w-3 h-3" />
                <span>
                  {t("settings.reset_win", {
                    cols: LAUNCH_COLS_DEFAULT,
                    rows: LAUNCH_ROWS_DEFAULT,
                  })}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("settings.cols")}
                </label>
                <input
                  type="number"
                  min={LAUNCH_COLS_MIN}
                  max={LAUNCH_COLS_MAX}
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                  className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("settings.rows")}
                </label>
                <input
                  type="number"
                  min={LAUNCH_ROWS_MIN}
                  max={LAUNCH_ROWS_MAX}
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Default local shell */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-300 font-medium">
                <TerminalIcon className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{t("settings.default_shell")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                {availableShells.length > 0 && (
                  <select
                    value={effectiveDefaultShell?.id ?? ""}
                    onChange={(e) => setDefaultShellId(e.target.value)}
                    className="h-8 max-w-[180px] px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                  >
                    {availableShells.map((shell) => (
                      <option key={shell.id} value={shell.id}>
                        {shell.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={() => void handleRescan()}
                  title={t("app.rescan")}
                  className="h-8 px-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-sky-300 inline-flex items-center gap-1 text-[11px] transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? "animate-spin" : ""}`} />
                  {availableShells.length === 0 && <span>{t("app.rescan")}</span>}
                </button>
              </div>
            </div>
            {availableShells.length === 0 && (
              <p className="text-[11px] text-amber-300/90">
                {t("settings.no_shells")}
              </p>
            )}
          </div>

          <CustomShellsSection
            customShells={customShells}
            onChange={setCustomShells}
            onFirstAdd={(profile) => {
              if (availableShells.length === 0) setDefaultShellId(profile.id);
            }}
          />

          {/* SFTP file conflict default policy */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <FolderSync className="w-4 h-4 text-sky-400 shrink-0" />
              <span>{t("settings.sftp_conflict_policy")}</span>
            </div>
            <select
              value={sftpConflictPolicy}
              onChange={(e) =>
                setSftpConflictPolicy(e.target.value as SftpConflictPolicy)
              }
              className="h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
            >
              <option value="ASK">{t("settings.sftp_conflict_ask")}</option>
              <option value="OVERWRITE">
                {t("settings.sftp_conflict_overwrite")}
              </option>
              <option value="SKIP">{t("settings.sftp_conflict_skip")}</option>
              <option value="RENAME">{t("settings.sftp_conflict_rename")}</option>
              <option value="RESUME">{t("settings.sftp_conflict_resume")}</option>
            </select>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t("common.save")}</span>
            </button>
          </div>
        </form>
    </ModalShell>
  );
};
