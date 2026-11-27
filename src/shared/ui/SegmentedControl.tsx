import React, { useRef } from "react";

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
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const containerSizeClasses = {
    sm: "p-0.5 gap-1 rounded-lg text-xs",
    md: "p-1 gap-1 rounded-lg text-xs",
  }[size];

  const itemSizeClasses = {
    sm: "py-1 px-2.5 rounded-md gap-1",
    md: "py-1.5 px-3 rounded-md gap-1.5",
  }[size];

  const activeIdx = options.findIndex((opt) => opt.value === value && !(disabled || opt.disabled));
  const fallbackIdx =
    activeIdx >= 0
      ? activeIdx
      : options.findIndex((opt) => !(disabled || opt.disabled));

  const moveSelection = (currentIndex: number, delta: 1 | -1) => {
    if (disabled || options.length === 0) return;
    for (let step = 1; step <= options.length; step++) {
      const nextIdx = (currentIndex + delta * step + options.length) % options.length;
      const candidate = options[nextIdx];
      if (!candidate.disabled) {
        onChange(candidate.value);
        itemRefs.current[nextIdx]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`flex items-center w-full bg-slate-900/60 rounded-lg border border-slate-800 ${containerSizeClasses} ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        const isDisabled = disabled || opt.disabled;
        const isTabStop = !isDisabled && idx === fallbackIdx;

        return (
          <button
            key={opt.value}
            ref={(el) => {
              itemRefs.current[idx] = el;
            }}
            type="button"
            role="radio"
            tabIndex={isTabStop ? 0 : -1}
            aria-checked={isSelected}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(opt.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                moveSelection(idx, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                moveSelection(idx, -1);
              }
            }}
            className={`flex-1 inline-flex items-center justify-center font-medium transition-all duration-150 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 disabled:opacity-40 disabled:cursor-not-allowed ${itemSizeClasses} ${
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
