import React from "react";
import { Plus, Upload } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, Checkbox, Input, SegmentedControl, Select } from "@/shared/ui";
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
      <SegmentedControl<KeyVaultMode>
        value={mode}
        onChange={onModeChange}
        options={[
          {
            value: "generate",
            label: t("vault.generate"),
            icon: <Plus className="w-3.5 h-3.5" />,
          },
          {
            value: "import",
            label: t("vault.import"),
            icon: <Upload className="w-3.5 h-3.5" />,
          },
        ]}
      />

      <form
        noValidate
        onSubmit={onSubmit}
        className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            ref={nameInputRef}
            type="text"
            label={t("vault.name")}
            labelExtra={
              <span className="text-[10px] text-slate-500 font-mono">
                {name.trim().length}/{MAX_KEY_NAME_LEN}
              </span>
            }
            maxLength={MAX_KEY_NAME_LEN}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
          />

          {mode === "generate" ? (
            <Select
              label={t("vault.type")}
              value={keyType}
              onChange={(e) => onKeyTypeChange(e.target.value as KeyAlgorithm)}
            >
              <option value="ED25519">{t("vault.ed25519")}</option>
              <option value="RSA_4096">{t("vault.rsa4096")}</option>
            </Select>
          ) : (
            <Input
              ref={sourcePathInputRef}
              type="text"
              label={t("vault.source_path")}
              value={sourcePath}
              onChange={(e) => onSourcePathChange(e.target.value)}
              className="font-mono"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            type="password"
            label={t("vault.passphrase")}
            value={passphrase}
            onChange={(e) => onPassphraseChange(e.target.value)}
          />

          {mode === "generate" ? (
            <Input
              type="text"
              label={t("vault.comment")}
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              className="font-mono"
            />
          ) : (
            <div className="flex items-center pt-5 h-[52px]">
              <Checkbox
                checked={copyManaged}
                onCheckedChange={onCopyManagedChange}
                label={t("vault.copy_managed")}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <Checkbox
            checked={setDefault}
            onCheckedChange={onSetDefaultChange}
            label={t("vault.set_default")}
          />

          <Button
            variant="success"
            type="submit"
            loading={loading}
            leftIcon={
              mode === "generate" ? (
                <Plus className="w-3.5 h-3.5" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )
            }
          >
            {mode === "generate" ? t("vault.generate") : t("vault.import")}
          </Button>
        </div>
      </form>
    </>
  );
};
