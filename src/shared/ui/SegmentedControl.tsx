import React from "react";

export interface SegmentOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentOption<T>>;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  options,
  size = "md",
  className = "",
  disabled = false,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  const containerSizeClasses = {
    sm: "p-0.5 gap-1 rounded-lg text-xs",
    md: "p-1 gap-1 rounded-lg text-xs",
  }[size];

  const itemSizeClasses = {
    sm: "py-1 px-2.5 rounded-md gap-1",
    md: "py-1.5 px-3 rounded-md gap-1.5",
  }[size];

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex items-center w-full bg-slate-900/60 rounded-lg border border-slate-800 ${containerSizeClasses} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        const isDisabled = disabled || opt.disabled;

        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(opt.value)}
            className={`flex-1 inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${itemSizeClasses} ${
              isSelected
                ? "bg-sky-500 text-slate-950 font-medium shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            {opt.icon && <span className="shrink-0 flex items-center">{opt.icon}</span>}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = "SegmentedControl";
