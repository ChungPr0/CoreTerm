import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftPortForward, HostFullConfigDto, UpdateHostRequestDto } from "../types";
import { hostsApi } from "../api/hostsApi";
import { keysApi, type SshKeyDto } from "@/modules/keys";
import { useI18n } from "@/shared/i18n";
import { useAlert } from "@/shared/ui";
import { formatLocalizedError } from "@/shared/utils/formatError";
import {
  createHostFormFields,
  validateAndBuildHostPayload,
  type HostFormFields,
} from "./hostFormHelpers";

interface UseHostFormArgs {
  isOpen: boolean;
  editingHost: HostFullConfigDto | null;
  initialGroupName?: string;
  keysVersion: number;
  onClose: () => void;
  onSaved: (saved: HostFullConfigDto) => void;
}

export function useHostForm({
  isOpen,
  editingHost,
  initialGroupName,
  keysVersion,
  onClose,
  onSaved,
}: UseHostFormArgs) {
  const { t } = useI18n();
  const alert = useAlert();

  const [fields, setFields] = useState<HostFormFields>(() =>
    createHostFormFields(null, initialGroupName)
  );
  const [pendingDeleteRuleIdx, setPendingDeleteRuleIdx] = useState<number | null>(null);
  const [savedKeys, setSavedKeys] = useState<SshKeyDto[]>([]);
  const [isGroupMenuOpen, setIsGroupMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const prevKeysVersionRef = useRef(keysVersion);
  const authStateRef = useRef({
    authMethod: fields.authMethod,
    selectedKeyId: fields.selectedKeyId,
    privateKeyPath: fields.privateKeyPath,
  });
  authStateRef.current = {
    authMethod: fields.authMethod,
    selectedKeyId: fields.selectedKeyId,
    privateKeyPath: fields.privateKeyPath,
  };

  const setters = useMemo(() => {
    const bind =
      <K extends keyof HostFormFields>(key: K) =>
      (value: HostFormFields[K]) =>
        setFields((prev) => ({ ...prev, [key]: value }));
    return {
      setAlias: bind("alias"),
      setHost: bind("host"),
      setPort: bind("port"),
      setUsername: bind("username"),
      setGroupName: bind("groupName"),
      setTagsInput: bind("tagsInput"),
      setAuthMethod: bind("authMethod"),
      setPasswordMode: bind("passwordMode"),
      setPassword: bind("password"),
      setPrivateKeyPath: bind("privateKeyPath"),
      setServerAliveInterval: bind("serverAliveInterval"),
      setStrictHostKeyChecking: bind("strictHostKeyChecking"),
      setCompression: bind("compression"),
      setForwardAgent: bind("forwardAgent"),
      setStartupCommand: bind("startupCommand"),
      setAutoReconnect: bind("autoReconnect"),
      setReconnectIntervalSec: bind("reconnectIntervalSec"),
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setPendingDeleteRuleIdx(null);
    setIsGroupMenuOpen(false);
    setFields(createHostFormFields(editingHost, initialGroupName));

    if (editingHost) return;

    let cancelled = false;
    keysApi
      .keyGetDefault()
      .then((defKey) => {
        if (cancelled || !defKey) return;
        setFields((prev) => ({
          ...prev,
          authMethod: "SSH_KEY",
          selectedKeyId: defKey.id,
          privateKeyPath: defKey.private_key_path,
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, editingHost, initialGroupName]);

  useEffect(() => {
    if (!isOpen) {
      prevKeysVersionRef.current = keysVersion;
      return;
    }
    const keysUpdatedWhileOpen = prevKeysVersionRef.current !== keysVersion;
    prevKeysVersionRef.current = keysVersion;

    let cancelled = false;
    keysApi
      .keyList()
      .then((list) => {
        if (cancelled) return;
        setSavedKeys(list);
        const cur = authStateRef.current;
        if (cur.selectedKeyId) {
          const existing = list.find((k) => k.id === cur.selectedKeyId);
          setFields((prev) => ({
            ...prev,
            selectedKeyId: existing ? prev.selectedKeyId : "",
            privateKeyPath: existing ? existing.private_key_path : "",
          }));
        } else if (
          keysUpdatedWhileOpen &&
          cur.authMethod === "SSH_KEY" &&
          !cur.privateKeyPath.trim()
        ) {
          const defKey =
            list.find((k) => k.is_default) ?? (list.length === 1 ? list[0] : undefined);
          if (defKey) {
            setFields((prev) => ({
              ...prev,
              selectedKeyId: defKey.id,
              privateKeyPath: defKey.private_key_path,
            }));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, keysVersion]);

  const handleSelectSavedKey = useCallback(
    (keyId: string) => {
      const found = keyId ? savedKeys.find((k) => k.id === keyId) : undefined;
      setFields((prev) => ({
        ...prev,
        selectedKeyId: keyId,
        privateKeyPath: found ? found.private_key_path : "",
      }));
    },
    [savedKeys]
  );

  const handleAddRule = useCallback((rule: DraftPortForward) => {
    setFields((prev) => ({ ...prev, forwards: [...prev.forwards, rule] }));
  }, []);

  const handleToggleRule = useCallback(
    async (idx: number) => {
      const target = fields.forwards[idx];
      if (!target) return;
      const nextState = !target.is_enabled;
      setFields((prev) => ({
        ...prev,
        forwards: prev.forwards.map((item, i) =>
          i === idx ? { ...item, is_enabled: nextState } : item
        ),
      }));
      if (target.id) {
        await hostsApi.portForwardToggle(target.id, nextState).catch(() => {});
      }
    },
    [fields.forwards]
  );

  const confirmRemoveRule = useCallback(() => {
    if (pendingDeleteRuleIdx === null) return;
    setFields((prev) => ({
      ...prev,
      forwards: prev.forwards.filter((_, i) => i !== pendingDeleteRuleIdx),
    }));
    setPendingDeleteRuleIdx(null);
  }, [pendingDeleteRuleIdx]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = validateAndBuildHostPayload(fields);
    if (!res.ok) return void alert.error(t(res.errorKey));

    setIsSaving(true);
    try {
      const savedHost: HostFullConfigDto = editingHost
        ? await hostsApi.hostUpdate({ ...res.payload, id: editingHost.id } as UpdateHostRequestDto)
        : await hostsApi.hostCreate(res.payload);
      onSaved(savedHost);
      onClose();
    } catch (err) {
      alert.error(formatLocalizedError(err, t));
    } finally {
      setIsSaving(false);
    }
  };

  return {
    ...fields,
    ...setters,
    pendingRule:
      pendingDeleteRuleIdx !== null ? fields.forwards[pendingDeleteRuleIdx] : undefined,
    setPendingDeleteRuleIdx,
    savedKeys,
    isGroupMenuOpen,
    setIsGroupMenuOpen,
    isSaving,
    handleSelectSavedKey,
    handleAddRule,
    handleToggleRule,
    confirmRemoveRule,
    handleSubmit,
  };
}
