import React, { forwardRef, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PopoverMenu } from "./PopoverMenu";

export interface SelectOption {
  value: string | number;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  label?: React.ReactNode;
  labelExtra?: React.ReactNode;
  error?: React.ReactNode;
  helperText?: React.ReactNode;
  selectSize?: "sm" | "md";
  variant?: "default" | "surface";
  options?: SelectOption[];
  children?: React.ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  className?: string;
  containerClassName?: string;
  selectClassName?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onValueChange?: (value: string | number) => void;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      label,
      labelExtra,
      error,
      helperText,
      selectSize = "md",
      variant = "default",
      options,
      children,
      value,
      placeholder,
      disabled = false,
      name,
      id,
      className = "",
      containerClassName = "",
      selectClassName = "",
      onChange,
      onValueChange,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const parsedOptions: SelectOption[] = useMemo(() => {
      if (options && options.length > 0) return options;
      const list: SelectOption[] = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child)) {
          const childProps = child.props as {
            value?: string | number;
            children?: React.ReactNode;
            disabled?: boolean;
          };
          list.push({
            value: childProps.value ?? "",
            label: childProps.children ?? String(childProps.value ?? ""),
            disabled: Boolean(childProps.disabled),
          });
        }
      });
      return list;
    }, [options, children]);

    const selectedOption = useMemo(() => {
      if (value !== undefined) {
        return parsedOptions.find((opt) => String(opt.value) === String(value));
      }
      return parsedOptions[0];
    }, [parsedOptions, value]);

    const handleSelect = (val: string | number) => {
      setIsOpen(false);
      onValueChange?.(val);
      if (onChange) {
        const fakeEvent = {
          target: { value: String(val), name: name ?? "" },
          currentTarget: { value: String(val), name: name ?? "" },
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.ChangeEvent<HTMLSelectElement>;
        onChange(fakeEvent);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = parsedOptions.findIndex(
            (opt) => String(opt.value) === String(value)
          );
          const nextIndex = Math.min(currentIndex + 1, parsedOptions.length - 1);
          if (nextIndex >= 0 && !parsedOptions[nextIndex].disabled) {
            handleSelect(parsedOptions[nextIndex].value);
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = parsedOptions.findIndex(
            (opt) => String(opt.value) === String(value)
          );
          const prevIndex = Math.max(currentIndex - 1, 0);
          if (prevIndex >= 0 && !parsedOptions[prevIndex].disabled) {
            handleSelect(parsedOptions[prevIndex].value);
          }
        }
      } else if (e.key === "Tab") {
        if (isOpen) setIsOpen(false);
      }
    };

    const sizeClasses =
      selectSize === "sm" ? "h-7 text-xs px-2.5" : "h-8 text-xs px-3";

    const variantClasses =
      variant === "surface"
        ? "bg-slate-900 border-slate-800"
        : "bg-slate-950 border-slate-800";

    const errorClasses = error
      ? "border-rose-500/80 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30"
      : isOpen
      ? "border-sky-500/80 ring-1 ring-sky-500/30"
      : "focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30";

    const widthClass = /\bw-/.test(containerClassName) ? "" : "w-full";

    const selectElement = (
      <div
        ref={containerRef}
        className={`relative inline-block ${widthClass} ${containerClassName}`}
      >
        <button
          ref={ref}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          onKeyDown={handleKeyDown}
          className={`w-full rounded-lg border text-slate-100 transition-colors focus:outline-none flex items-center justify-between gap-2 text-left select-none ${
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-slate-700"
          } ${sizeClasses} ${variantClasses} ${errorClasses} ${selectClassName} ${className}`}
        >
          <span className="truncate flex-1">
            {selectedOption ? selectedOption.label : (placeholder || "")}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? "rotate-180 text-sky-400" : ""
            }`}
          />
        </button>

        <PopoverMenu
          isOpen={isOpen && parsedOptions.length > 0}
          onClose={() => setIsOpen(false)}
          anchorRef={containerRef}
          portal
          matchAnchorWidth
          maxHeightPx={224}
          className="z-[90] rounded-lg bg-slate-900 border border-slate-700/90 shadow-2xl py-1 overflow-y-auto select-none"
        >
          {parsedOptions.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                disabled={opt.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(opt.value)}
                className={`w-full pl-3 pr-[7px] py-1.5 flex items-center justify-between gap-2 text-left text-xs transition-colors ${
                  opt.disabled
                    ? "opacity-40 cursor-not-allowed"
                    : isSelected
                    ? "bg-sky-500/15 text-sky-300 font-medium"
                    : "text-slate-200 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                )}
              </button>
            );
          })}
        </PopoverMenu>
      </div>
    );

    if (!label && !error && !helperText) {
      return selectElement;
    }

    return (
      <div className="space-y-1 w-full">
        {(label || labelExtra) && (
          <div className="flex items-center justify-between text-slate-300 font-medium">
            {label && <label className="block">{label}</label>}
            {labelExtra && <div>{labelExtra}</div>}
          </div>
        )}
        {selectElement}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
        {helperText && !error && (
          <p className="text-[11px] text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
