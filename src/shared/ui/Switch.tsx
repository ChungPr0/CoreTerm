import React from "react";

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  size?: "sm" | "md";
  tone?: "sky" | "rose" | "emerald";
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = "md",
  tone = "sky",
  className = "",
  id,
  "aria-label": ariaLabel,
}) => {
  const isSm = size === "sm";

  const trackSize = isSm ? "h-4 w-7" : "h-5 w-9";
  const knobSize = isSm ? "h-3 w-3" : "h-4 w-4";
  const knobTranslate = isSm
    ? checked
      ? "translate-x-3"
      : "translate-x-0"
    : checked
    ? "translate-x-4"
    : "translate-x-0";

  const toneBg =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "emerald"
      ? "bg-emerald-500"
      : "bg-sky-500";

  const switchButton = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange?.(!checked);
      }}
      className={`relative inline-flex ${trackSize} shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:ring-offset-1 focus:ring-offset-slate-900 ${
        checked ? toneBg : "bg-slate-700 hover:bg-slate-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      <span
        className={`pointer-events-none inline-block ${knobSize} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${knobTranslate}`}
      />
    </button>
  );

  if (!label && !description) {
    return switchButton;
  }

  return (
    <div
      onClick={() => {
        if (!disabled) onChange?.(!checked);
      }}
      className={`inline-flex items-center gap-2 select-none ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      {switchButton}
      <div className="flex flex-col">
        {label && (
          <span className="text-xs text-slate-200 font-medium">{label}</span>
        )}
        {description && (
          <span className="text-[11px] text-slate-400">{description}</span>
        )}
      </div>
    </div>
  );
};
