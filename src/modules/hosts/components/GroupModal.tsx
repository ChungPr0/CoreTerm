import React, { useEffect, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { MAX_ENTITY_NAME_LEN } from "@/shared/defaults";
import { useI18n } from "@/shared/i18n";
import { formatLocalizedError } from "@/shared/utils/formatError";
import { scrollAndFocusInput } from "@/shared/utils/editableTarget";
import { ActionModal, Input, useAlert } from "@/shared/ui";

interface GroupModalProps {
  isOpen: boolean;
  existingGroups: string[];
  isSubmitting?: boolean;
  onClose: () => void;
  onCreateGroup: (name: string) => Promise<void>;
}

export const GroupModal: React.FC<GroupModalProps> = ({
  isOpen,
  existingGroups,
  isSubmitting = false,
  onClose,
  onCreateGroup,
}) => {
  const { t } = useI18n();
  const alert = useAlert();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_required"));
    }
    if (trimmed.length > MAX_ENTITY_NAME_LEN) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_too_long"));
    }

    const duplicate = existingGroups.some(
      (g) => g.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      scrollAndFocusInput(inputRef.current);
      return void alert.error(t("group.name_duplicate"));
    }

    try {
      await onCreateGroup(trimmed);
    } catch (err) {
      scrollAndFocusInput(inputRef.current);
      alert.error(formatLocalizedError(err, t));
    }
  };

  return (
    <ActionModal
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      title={t("group.create_title")}
      icon={<FolderPlus className="h-4 w-4" />}
      iconTone="primary"
      size="sm"
      confirmLabel={t("common.add")}
      confirmVariant="primary"
      confirmIcon={<FolderPlus className="h-3.5 w-3.5" />}
      cancelLabel={t("common.cancel")}
      onConfirm={handleSubmit}
    >
      <div className="rounded border border-[#21262d] bg-[#161b22] p-3.5">
        <Input
          ref={inputRef}
          type="text"
          label={`${t("group.name")} *`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("group.name_placeholder")}
          maxLength={MAX_ENTITY_NAME_LEN}
          disabled={isSubmitting}
        />
      </div>
    </ActionModal>
  );
};
