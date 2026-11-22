import React from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { ActionModal, Button } from "@/shared/ui";
import type { EditorDiscardAction } from "../types";

interface EditorDiscardModalProps {
  confirmDiscard: EditorDiscardAction;
  fileName: string;
  saving: boolean;
  canSaveAndClose: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndClose: () => void;
}

export const EditorDiscardModal: React.FC<EditorDiscardModalProps> = ({
  confirmDiscard,
  fileName,
  saving,
  canSaveAndClose,
  onCancel,
  onDiscard,
  onSaveAndClose,
}) => {
  const { t } = useI18n();

  return (
    <ActionModal
      isOpen={confirmDiscard !== null}
      onClose={onCancel}
      busy={saving}
      title={
        confirmDiscard === "close"
          ? t("editor.unsaved_close_title")
          : t("editor.unsaved_reload_title")
      }
      subtitle={fileName}
      icon={<AlertTriangle className="h-4 w-4" />}
      iconTone="warning"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" disabled={saving} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" size="sm" disabled={saving} onClick={onDiscard}>
            {t("editor.discard")}
          </Button>
          {confirmDiscard === "close" && canSaveAndClose && (
            <Button variant="primary" size="sm" loading={saving} onClick={onSaveAndClose}>
              {t("editor.save_and_close")}
            </Button>
          )}
        </>
      }
    >
      <p className="text-slate-300 leading-relaxed">
        {confirmDiscard === "close"
          ? t("editor.unsaved_close_msg")
          : t("editor.unsaved_reload_msg")}
      </p>
    </ActionModal>
  );
};
