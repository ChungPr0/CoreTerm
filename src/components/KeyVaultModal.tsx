import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { SshKeyDto } from "../types/ipc";
import { tauriApi } from "../services/tauriApi";
import { useI18n } from "../i18n";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import { formatLocalizedError } from "../utils/formatError";

const MAX_KEY_NAME_LEN = 64;

function normalizePathInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

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
  const [keys, setKeys] = useState<SshKeyDto[]>([]);
  const [mode, setMode] = useState<"generate" | "import">("generate");

  const [name, setName] = useState("");
  const [keyType, setKeyType] = useState<"ED25519" | "RSA_4096">("ED25519");
  const [comment, setComment] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [copyManaged, setCopyManaged] = useState(true);
  const [setDefault, setSetDefault] = useState(true);
  const [deleteDiskInConfirm, setDeleteDiskInConfirm] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<SshKeyDto | null>(null);
  const [deleteKeyError, setDeleteKeyError] = useState<string | null>(null);
  const [deletingKeyLoading, setDeletingKeyLoading] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  const showError = (msg: string) => {
    setErrorMsg(msg);
    modalBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openDeleteKeyConfirm = (key: SshKeyDto) => {
    setDeleteDiskInConfirm(false);
    setDeleteKeyError(null);
    setPendingDeleteKey(key);
  };

  const closeDeleteKeyConfirm = () => {
    setPendingDeleteKey(null);
    setDeleteDiskInConfirm(false);
    setDeleteKeyError(null);
  };

  const loadKeys = async () => {
    try {
      const list = await tauriApi.keyList();
      setKeys(list);
    } catch (err) {
      showError(formatLocalizedError(err, t));
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      loadKeys();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showError(t("vault.name_required"));
      return;
    }
    if (trimmedName.length > MAX_KEY_NAME_LEN) {
      showError(t("vault.name_too_long"));
      return;
    }
    if (
      keys.some(
        (k) => k.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      showError(t("vault.name_duplicate"));
      return;
    }

    const cleanSourcePath = normalizePathInput(sourcePath);
    if (mode === "import") {
      if (!cleanSourcePath) {
        showError(t("vault.path_required"));
        return;
      }
      const existingByPath = keys.find(
        (k) =>
          k.private_key_path.trim().toLowerCase() ===
          cleanSourcePath.toLowerCase()
      );
      if (existingByPath) {
        showError(`${t("vault.path_duplicate")} (${existingByPath.name})`);
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      if (mode === "generate") {
        await tauriApi.keyGenerate({
          name: trimmedName,
          key_type: keyType,
          comment: comment.trim() || undefined,
          passphrase: passphrase || undefined,
          set_default: setDefault,
        });
      } else {
        await tauriApi.keyImport({
          name: trimmedName,
          source_path: cleanSourcePath,
          copy_to_managed_dir: copyManaged,
          passphrase: passphrase || undefined,
          set_default: setDefault,
        });
      }
      setName("");
      setComment("");
      setPassphrase("");
      setSourcePath("");
      await loadKeys();
      onKeysChanged();
    } catch (err) {
      showError(formatLocalizedError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDefault = async (key: SshKeyDto) => {
    try {
      await tauriApi.keySetDefault(key.is_default ? null : key.id);
      await loadKeys();
      onKeysChanged();
    } catch (err) {
      showError(formatLocalizedError(err, t));
    }
  };

  const handleCopyPub = async (key: SshKeyDto) => {
    if (!key.public_key_content) return;
    await navigator.clipboard.writeText(key.public_key_content);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const confirmDeleteKey = async () => {
    if (!pendingDeleteKey) return;
    const shouldDeleteFile =
      pendingDeleteKey.file_exists && deleteDiskInConfirm;
    setDeletingKeyLoading(true);
    setDeleteKeyError(null);
    try {
      await tauriApi.keyDelete(pendingDeleteKey.id, shouldDeleteFile);
      closeDeleteKeyConfirm();
      await loadKeys();
      onKeysChanged();
    } catch (err) {
      setDeleteKeyError(formatLocalizedError(err, t));
    } finally {
      setDeletingKeyLoading(false);
    }
  };

  const pendingDeleteDisk =
    !!pendingDeleteKey && pendingDeleteKey.file_exists && deleteDiskInConfirm;

  return (
    <>
      <div
        data-modal-root="true"
        className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
      >
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-full select-none">
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

        <div ref={modalBodyRef} className="p-5 space-y-4 overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("generate");
                setErrorMsg(null);
              }}
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
              onClick={() => {
                setMode("import");
                setErrorMsg(null);
              }}
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
            onSubmit={handleSubmit}
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
                  type="text"
                  maxLength={MAX_KEY_NAME_LEN}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100"
                  required
                />
              </div>

              {mode === "generate" ? (
                <div>
                  <label className="h-4 flex items-center text-slate-400 mb-1 leading-4">
                    {t("vault.type")}
                  </label>
                  <select
                    value={keyType}
                    onChange={(e) =>
                      setKeyType(e.target.value as "ED25519" | "RSA_4096")
                    }
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
                    type="text"
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                    required
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
                  onChange={(e) => setPassphrase(e.target.value)}
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
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full h-8 px-3 rounded bg-slate-900 border border-slate-800 text-slate-100 font-mono"
                  />
                </div>
              ) : (
                <div className="flex items-center pt-5 h-[52px]">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={copyManaged}
                      onChange={(e) => setCopyManaged(e.target.checked)}
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
                  onChange={(e) => setSetDefault(e.target.checked)}
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

          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300">{t("vault.title")}</span>
            {keys.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
                {keys.length}
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {keys.length === 0 ? (
              <div className="py-6 text-center text-slate-500">{t("vault.empty")}</div>
            ) : (
              keys.map((k) => (
                  <div
                    key={k.id}
                    className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-100 truncate">
                            {k.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-mono text-sky-300">
                            {k.key_type}
                          </span>
                          {k.is_default && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold">
                              {t("vault.default")}
                            </span>
                          )}
                          {!k.file_exists && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                              {t("vault.file_missing")}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {k.fingerprint}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleDefault(k)}
                          title={t("vault.set_default")}
                          className={`p-1.5 rounded border transition-colors ${
                            k.is_default
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>

                        {k.public_key_content && (
                          <button
                            type="button"
                            onClick={() => handleCopyPub(k)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                          >
                            {copiedId === k.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{t("common.copied")}</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>{t("vault.copy_pub")}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-slate-500 font-mono truncate min-w-0 flex-1">
                        {k.private_key_path}
                      </div>

                      <button
                        type="button"
                        onClick={() => openDeleteKeyConfirm(k)}
                        title={t("common.delete")}
                        className="inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 text-[11px] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t("common.delete")}</span>
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteKey}
        title={t("vault.delete_confirm")}
        itemName={
          pendingDeleteKey
            ? `${pendingDeleteKey.name} (${pendingDeleteKey.key_type})`
            : ""
        }
        itemDetail={pendingDeleteKey?.private_key_path}
        checkboxLabel={t("vault.delete_disk")}
        checkboxChecked={pendingDeleteDisk}
        checkboxDisabled={!pendingDeleteKey?.file_exists}
        checkboxDisabledHint={t("vault.file_missing")}
        onCheckboxChange={setDeleteDiskInConfirm}
        note={
          pendingDeleteDisk
            ? t("vault.delete_disk_warning")
            : t("vault.delete_keep_disk_note")
        }
        noteTone={pendingDeleteDisk ? "danger" : "neutral"}
        errorMessage={deleteKeyError}
        isDeleting={deletingKeyLoading}
        onCancel={closeDeleteKeyConfirm}
        onConfirm={confirmDeleteKey}
      />
    </>
  );
};
