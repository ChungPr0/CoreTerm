import { useCallback, useEffect, useRef, useState } from "react";
import type { SshKeyDto } from "../types";
import { keysApi } from "../api/keysApi";
import { useI18n } from "@/shared/i18n";
import { useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";

export const MAX_KEY_NAME_LEN = 64;

function normalizePathInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export type KeyVaultMode = "generate" | "import";
export type KeyAlgorithm = "ED25519" | "RSA_4096";

interface UseKeyVaultArgs {
  isOpen: boolean;
  onKeysChanged: () => void;
}

export function useKeyVault({ isOpen, onKeysChanged }: UseKeyVaultArgs) {
  const { t } = useI18n();
  const alert = useAlert();

  const [keys, setKeys] = useState<SshKeyDto[]>([]);
  const [mode, setMode] = useState<KeyVaultMode>("generate");
  const [name, setName] = useState("");
  const [keyType, setKeyType] = useState<KeyAlgorithm>("ED25519");
  const [comment, setComment] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [copyManaged, setCopyManaged] = useState(true);
  const [setDefault, setSetDefault] = useState(true);

  const [deleteDiskInConfirm, setDeleteDiskInConfirm] = useState(false);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<SshKeyDto | null>(null);
  const [deletingKeyLoading, setDeletingKeyLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const sourcePathInputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await keysApi.keyList());
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    }
  }, [alert, t]);

  useEffect(() => {
    if (isOpen) {
      void loadKeys();
    }
  }, [isOpen, loadKeys]);

  const openDeleteKeyConfirm = useCallback((key: SshKeyDto) => {
    setDeleteDiskInConfirm(false);
    setPendingDeleteKey(key);
  }, []);

  const closeDeleteKeyConfirm = useCallback(() => {
    setPendingDeleteKey(null);
    setDeleteDiskInConfirm(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      scrollAndFocusInput(nameInputRef.current);
      return void alert.error(t("vault.name_required"));
    }
    if (trimmedName.length > MAX_KEY_NAME_LEN) {
      scrollAndFocusInput(nameInputRef.current);
      return void alert.error(t("vault.name_too_long"));
    }

    const dupName = keys.some((k) => k.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (dupName) {
      scrollAndFocusInput(nameInputRef.current);
      return void alert.error(t("vault.name_duplicate"));
    }

    const cleanSourcePath = normalizePathInput(sourcePath);
    if (mode === "import") {
      if (!cleanSourcePath) {
        scrollAndFocusInput(sourcePathInputRef.current);
        return void alert.error(t("vault.path_required"));
      }
      const dupPath = keys.find(
        (k) => k.private_key_path.trim().toLowerCase() === cleanSourcePath.toLowerCase()
      );
      if (dupPath) {
        scrollAndFocusInput(sourcePathInputRef.current);
        return void alert.error(`${t("vault.path_duplicate")} (${dupPath.name})`);
      }
    }

    setLoading(true);
    try {
      if (mode === "generate") {
        await keysApi.keyGenerate({
          name: trimmedName,
          key_type: keyType,
          comment: comment.trim() || undefined,
          passphrase: passphrase || undefined,
          set_default: setDefault,
        });
      } else {
        await keysApi.keyImport({
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
      scrollAndFocusInput(nameInputRef.current);
      alert.error(formatLocalizedError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDefault = async (key: SshKeyDto) => {
    try {
      await keysApi.keySetDefault(key.is_default ? null : key.id);
      await loadKeys();
      onKeysChanged();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    }
  };

  const handleCopyPub = async (key: SshKeyDto) => {
    if (!key.public_key_content) return;
    await navigator.clipboard.writeText(key.public_key_content).catch(() => {});
    setCopiedId(key.id);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1500);
  };

  const confirmDeleteKey = async () => {
    if (!pendingDeleteKey) return;
    const deleteDisk = pendingDeleteKey.file_exists && deleteDiskInConfirm;
    setDeletingKeyLoading(true);
    try {
      await keysApi.keyDelete(pendingDeleteKey.id, deleteDisk);
      closeDeleteKeyConfirm();
      await loadKeys();
      onKeysChanged();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setDeletingKeyLoading(false);
    }
  };

  const pendingDeleteDisk =
    !!pendingDeleteKey && pendingDeleteKey.file_exists && deleteDiskInConfirm;

  return {
    keys,
    mode,
    setMode,
    name,
    setName,
    nameInputRef,
    sourcePathInputRef,
    keyType,
    setKeyType,
    comment,
    setComment,
    passphrase,
    setPassphrase,
    sourcePath,
    setSourcePath,
    copyManaged,
    setCopyManaged,
    setDefault,
    setSetDefault,
    deleteDiskInConfirm,
    setDeleteDiskInConfirm,
    pendingDeleteKey,
    pendingDeleteDisk,
    deletingKeyLoading,
    copiedId,
    loading,
    openDeleteKeyConfirm,
    closeDeleteKeyConfirm,
    confirmDeleteKey,
    handleSubmit,
    handleToggleDefault,
    handleCopyPub,
  };
}
