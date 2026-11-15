import React, { useEffect } from "react";

interface ModalShellProps {
  isOpen: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  positionClassName?: string;
  zIndexClass?: string;
  backdropClassName?: string;
  containerClassName?: string;
  panelClassName?: string;
  children: React.ReactNode;
}

export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  onClose,
  closeDisabled = false,
  closeOnBackdrop = false,
  closeOnEscape = true,
  positionClassName = "absolute inset-0",
  zIndexClass = "z-50",
  backdropClassName = "bg-slate-950/80 backdrop-blur-sm",
  containerClassName = "items-center justify-center p-3 sm:p-4",
  panelClassName = "bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden select-none",
  children,
}) => {
  useEffect(() => {
    if (!isOpen || !onClose || !closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, onClose, closeDisabled, closeOnEscape]);

  if (!isOpen) return null;

  return (
    <div
      data-modal-root="true"
      onClick={() => {
        if (closeOnBackdrop && !closeDisabled) onClose?.();
      }}
      className={`${positionClassName} ${zIndexClass} ${backdropClassName} flex ${containerClassName}`}
    >
      <div onClick={(e) => e.stopPropagation()} className={panelClassName}>
        {children}
      </div>
    </div>
  );
};
