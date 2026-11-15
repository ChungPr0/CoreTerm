import React, { useEffect, useState } from "react";
import {
  Activity,
  FolderSync,
  Globe,
  Monitor,
  RotateCcw,
  Save,
  Settings,
  X,
} from "lucide-react";
import { type Locale, useI18n } from "@/shared/i18n";
import type { SftpConflictPolicy } from "@/shared/types/ipc";
import { ModalShell } from "@/shared/ui";
import type { AppSettingsValues } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettingsValues;
  onClose: () => void;
  onSave: (next: AppSettingsValues) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
}) => {
  const { locale, setLocale, t } = useI18n();
  const [cols, setCols] = useState<number>(settings.launchCols);
  const [rows, setRows] = useState<number>(settings.launchRows);
  const [telemetry, setTelemetry] = useState<boolean>(settings.showLocalTelemetry);
  const [telemetryInterval, setTelemetryInterval] = useState<number>(
    settings.telemetryIntervalSec
  );
  const [sftpConflictPolicy, setSftpConflictPolicy] =
    useState<SftpConflictPolicy>(settings.sftpConflictPolicy ?? "ASK");

  useEffect(() => {
    if (!isOpen) return;
    setCols(settings.launchCols);
    setRows(settings.launchRows);
    setTelemetry(settings.showLocalTelemetry);
    setTelemetryInterval(settings.telemetryIntervalSec);
    setSftpConflictPolicy(settings.sftpConflictPolicy ?? "ASK");
  }, [isOpen, settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validCols = Math.min(Math.max(Number(cols) || 120, 40), 300);
    const validRows = Math.min(Math.max(Number(rows) || 30, 10), 120);
    const validTelemetrySec = Math.min(
      Math.max(Number(telemetryInterval) || 2, 1),
      60
    );
    onSave({
      launchCols: validCols,
      launchRows: validRows,
      showLocalTelemetry: telemetry,
      telemetryIntervalSec: validTelemetrySec,
      sftpConflictPolicy,
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
      panelClassName="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-full overflow-hidden flex flex-col text-xs select-none"
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

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto">
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
                  setCols(120);
                  setRows(30);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t("settings.reset_win")}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t("settings.cols")}
                </label>
                <input
                  type="number"
                  min={40}
                  max={300}
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
                  min={10}
                  max={120}
                  value={rows}
                  onChange={(e) => setRows(Number(e.target.value))}
                  className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Local terminal CPU/RAM telemetry */}
          <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-200">
                    {t("settings.show_telemetry")}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {t("settings.show_telemetry_desc")}
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={telemetry}
                onChange={(e) => setTelemetry(e.target.checked)}
                className="w-4 h-4 accent-sky-500 cursor-pointer"
              />
            </label>

            {telemetry && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-slate-400">
                  {t("settings.telemetry_interval")}
                </span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={telemetryInterval}
                  onChange={(e) => setTelemetryInterval(Number(e.target.value))}
                  className="w-20 h-8 px-2.5 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono text-right"
                />
              </div>
            )}
          </div>

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
