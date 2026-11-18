import React from "react";
import { Loader2, Plus, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import {
  MAX_KEY_NAME_LEN,
  type KeyAlgorithm,
  type KeyVaultMode,
} from "../hooks/useKeyVault";

interface KeyGenerateImportFormProps {
  mode: KeyVaultMode;
  onModeChange: (mode: KeyVaultMode) => void;
  name: string;
  onNameChange: (v: string) => void;
  nameInputRef?: React.RefObject<HTMLInputElement>;
  keyType: KeyAlgorithm;
  onKeyTypeChange: (v: KeyAlgorithm) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  passphrase: string;
  onPassphraseChange: (v: string) => void;
  sourcePath: string;
  onSourcePathChange: (v: string) => void;
  sourcePathInputRef?: React.RefObject<HTMLInputElement>;
  copyManaged: boolean;
  onCopyManagedChange: (v: boolean) => void;
  setDefault: boolean;
  onSetDefaultChange: (v: boolean) => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export const KeyGenerateImportForm: React.FC<KeyGenerateImportFormProps> = ({
  mode,
  onModeChange,
  name,
  onNameChange,
  nameInputRef,
  keyType,
  onKeyTypeChange,
  comment,
  onCommentChange,
  passphrase,
  onPassphraseChange,
  sourcePath,
  onSourcePathChange,
  sourcePathInputRef,
  copyManaged,
  onCopyManagedChange,
  setDefault,
  onSetDefaultChange,
  loading,
  onSubmit,
}) => {
  const { t } = useI18n();

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onModeChange("generate")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            mode === "generate"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("vault.generate")}</span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange("import")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            mode === "import"
              ? "bg-sky-500 text-slate-950"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          <span>{t("vault.import")}</span>
        </button>
      </div>

      <form
        noValidate
        onSubmit={onSubmit}
        className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="h-4 flex items-center justify-between mb-1 leading-4">
              <label className="text-slate-400">{t("vault.name")}</label>
              <span className="text-[10px] text-slate-500 font-mono">
                {name.trim().length}/{MAX_KEY_NAME_LEN}
              </span>
            </div>
            <input
              ref={nameInputRef}
              type="text"
              maxLength={MAX_KEY_NAME_LEN}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
            />
          </div>

          {mode === "generate" ? (
            <div>
              <label className="h-4 flex items-center text-slate-400 mb-1 leading-4">
                {t("vault.type")}
              </label>
              <select
                value={keyType}
                onChange={(e) => onKeyTypeChange(e.target.value as KeyAlgorithm)}
                className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
              >
                <option value="ED25519">{t("vault.ed25519")}</option>
                <option value="RSA_4096">{t("vault.rsa4096")}</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="h-4 flex items-center text-slate-400 mb-1 leading-4">
                {t("vault.source_path")}
              </label>
              <input
                ref={sourcePathInputRef}
                type="text"
                value={sourcePath}
                onChange={(e) => onSourcePathChange(e.target.value)}
                className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="h-4 flex items-center text-slate-400 mb-1 leading-4">
              {t("vault.passphrase")}
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => onPassphraseChange(e.target.value)}
              className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
            />
          </div>

          {mode === "generate" ? (
            <div>
              <label className="h-4 flex items-center text-slate-400 mb-1 leading-4">
                {t("vault.comment")}
              </label>
              <input
                type="text"
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
              />
            </div>
          ) : (
            <div className="flex items-center pt-5 h-[52px]">
              <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={copyManaged}
                  onChange={(e) => onCopyManagedChange(e.target.checked)}
                />
                <span>{t("vault.copy_managed")}</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={setDefault}
              onChange={(e) => onSetDefaultChange(e.target.checked)}
            />
            <span>{t("vault.set_default")}</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold disabled:opacity-70 disabled:cursor-wait"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {loading
                ? t("common.loading")
                : mode === "generate"
                ? t("vault.generate")
                : t("vault.import")}
            </span>
          </button>
        </div>
      </form>
    </>
  );
};
