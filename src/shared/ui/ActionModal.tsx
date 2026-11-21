import React from "react";
import { Check, Trash2, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button, type ButtonVariant } from "./Button";
import { IconButton } from "./IconButton";
import { ModalShell } from "./ModalShell";

export type ActionModalTone = "primary" | "danger" | "warning" | "success" | "neutral";
export type ActionModalSize = "sm" | "md" | "lg";

export interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  busy?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  iconTone?: ActionModalTone;
  size?: ActionModalSize;
  panelClassName?: string;
  contentClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmIcon?: React.ReactNode;
  cancelLabel?: string | null;
  onConfirm?: () => void | Promise<void>;
  onSubmit?: (e: React.FormEvent) => void;
  confirmDisabled?: boolean;
  confirmAutoFocus?: boolean;
  formId?: string;
}

const TONE_CLASSES: Record<ActionModalTone, string> = {
  primary: "bg-[#1f6feb]/20 text-[#58a6ff]",
  danger: "bg-rose-500/15 text-rose-400",
  warning: "bg-amber-500/15 text-amber-400",
  success: "bg-emerald-500/15 text-emerald-400",
  neutral: "bg-[#21262d] text-[#8b949e]",
};

const SIZE_CLASSES: Record<ActionModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export const ActionModal: React.FC<ActionModalProps> = ({
  isOpen,
  onClose,
  busy = false,
  title,
  subtitle,
  icon,
  iconTone = "primary",
  size = "md",
  panelClassName = "",
  contentClassName = "",
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = true,
  children,
  footer,
  confirmLabel,
  confirmVariant = "primary",
  confirmIcon,
  cancelLabel,
  onConfirm,
  onSubmit,
  confirmDisabled = false,
  confirmAutoFocus = false,
  formId,
}) => {
  const { t } = useI18n();

  if (!isOpen) return null;

  const hasForm = !!(onSubmit || onConfirm);

  const defaultIcon =
    confirmVariant === "danger" ? (
      <Trash2 className="h-3.5 w-3.5" />
    ) : (
      <Check className="h-3.5 w-3.5" />
    );

  const resolvedConfirmIcon = confirmIcon === undefined ? defaultIcon : confirmIcon;

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || confirmDisabled) return;
    if (onSubmit) {
      onSubmit(e);
    } else if (onConfirm) {
      void onConfirm();
    }
  };

  const headerContent = (
    <div
      data-tauri-drag-region="deep"
      className="flex items-start justify-between gap-3 border-b border-[#21262d] px-4 py-3 shrink-0"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && (
          <div className={`mt-0.5 rounded p-1.5 shrink-0 ${TONE_CLASSES[iconTone]}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#e6edf3] leading-snug">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[#8b949e] leading-normal break-words">{subtitle}</p>
          )}
        </div>
      </div>

      {showCloseButton && (
        <IconButton
          disabled={busy}
          onClick={onClose}
          title={t("common.close")}
          icon={<X className="h-4 w-4" />}
          size="sm"
        />
      )}
    </div>
  );

  const bodyContent = (
    <div className={`space-y-3 p-4 text-xs ${contentClassName}`}>{children}</div>
  );

  const footerContent = footer ? (
    <div className="flex items-center justify-end gap-2 border-t border-[#21262d] px-4 py-3 shrink-0">
      {footer}
    </div>
  ) : hasForm || confirmLabel ? (
    <div className="flex items-center justify-end gap-2 border-t border-[#21262d] px-4 py-3 shrink-0">
      {cancelLabel !== null && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
          {cancelLabel ?? t("common.cancel")}
        </Button>
      )}
      <Button
        type={hasForm ? "submit" : "button"}
        variant={confirmVariant}
        size="sm"
        disabled={busy || confirmDisabled}
        loading={busy}
        autoFocus={confirmAutoFocus}
        leftIcon={resolvedConfirmIcon ?? undefined}
      >
        {confirmLabel ?? t("common.confirm")}
      </Button>
    </div>
  ) : null;

  const innerContent = (
    <>
      {headerContent}
      {bodyContent}
      {footerContent}
    </>
  );

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={busy}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      positionClassName="fixed inset-0"
      backdropClassName="bg-black/75"
      containerClassName="select-none items-center justify-center p-4"
      panelClassName={`w-full ${SIZE_CLASSES[size]} rounded-lg border border-[#30363d] bg-[#0d1117] text-[#c9d1d9] shadow-2xl overflow-hidden flex flex-col ${panelClassName}`}
    >
      {hasForm ? (
        <form
          id={formId}
          noValidate
          role="dialog"
          aria-modal="true"
          onSubmit={handleFormSubmit}
          className="flex flex-col min-h-0"
        >
          {innerContent}
        </form>
      ) : (
        <div role="dialog" aria-modal="true" className="flex flex-col min-h-0">
          {innerContent}
        </div>
      )}
    </ModalShell>
  );
};
