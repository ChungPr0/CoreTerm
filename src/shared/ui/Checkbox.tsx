import React, { forwardRef } from "react";
import { Check } from "lucide-react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  tone?: "sky" | "rose" | "emerald";
  size?: "sm" | "md";
  containerClassName?: string;
  boxClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked = false,
      onChange,
      onCheckedChange,
      label,
      description,
      tone = "sky",
      size = "md",
      disabled = false,
      className = "",
      containerClassName = "",
      boxClassName = "",
      id,
      ...rest
    },
    ref
  ) => {
    const isSm = size === "sm";
    const boxSize = isSm ? "w-3.5 h-3.5" : "w-4 h-4";
    const iconSize = isSm ? "w-2.5 h-2.5 stroke-[3]" : "w-3 h-3 stroke-[3]";

    const toneClasses =
      tone === "rose"
        ? "bg-rose-500 border-rose-500 text-white"
        : tone === "emerald"
        ? "bg-emerald-500 border-emerald-500 text-slate-950"
        : "bg-sky-500 border-sky-500 text-slate-950";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    const visualBox = (
      <div
        className={`relative ${boxSize} rounded border flex items-center justify-center transition-all duration-150 shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500/50 peer-focus-visible:border-sky-500 ${
          checked
            ? toneClasses
            : "bg-slate-950 border-slate-700 hover:border-slate-500 group-hover:border-slate-500"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${boxClassName}`}
      >
        <Check
          className={`${iconSize} transition-transform duration-150 ${
            checked ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        />
      </div>
    );

    const hiddenInput = (
      <input
        ref={ref}
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
        className="peer sr-only"
        {...rest}
      />
    );

    if (!label && !description) {
      return (
        <label
          className={`inline-flex items-center justify-center relative cursor-pointer group ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          } ${className}`}
        >
          {hiddenInput}
          {visualBox}
        </label>
      );
    }

    return (
      <label
        className={`group inline-flex items-center gap-2 select-none relative ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${containerClassName} ${className}`}
      >
        {hiddenInput}
        {visualBox}
        <div className="flex flex-col">
          {label && (
            <span className="text-xs text-slate-200 font-medium group-hover:text-slate-100 transition-colors">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-slate-400">{description}</span>
          )}
        </div>
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
