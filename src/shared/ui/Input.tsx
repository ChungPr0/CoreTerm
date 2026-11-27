import React, { forwardRef, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  labelExtra?: React.ReactNode;
  error?: React.ReactNode;
  helperText?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  hideStepper?: boolean;
  inputSize?: "sm" | "md";
  variant?: "default" | "surface";
  containerClassName?: string;
  inputClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      labelExtra,
      error,
      helperText,
      leftIcon,
      rightIcon,
      hideStepper = false,
      inputSize = "md",
      variant = "default",
      className = "",
      containerClassName = "",
      inputClassName = "",
      disabled,
      ...rest
    },
    ref
  ) => {
    const internalRef = useRef<HTMLInputElement | null>(null);

    const setRef = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    };

    const isNumberType = rest.type === "number";
    const showNumberStepper = isNumberType && !hideStepper && !rightIcon;

    const handleStep = (direction: 1 | -1) => {
      if (disabled) return;
      const el = internalRef.current;
      const rawVal = rest.value !== undefined ? rest.value : (el ? el.value : "");
      const currentVal = rawVal !== "" && rawVal !== undefined ? Number(rawVal) : 0;
      const step = rest.step !== undefined ? Number(rest.step) : 1;
      const min = rest.min !== undefined ? Number(rest.min) : -Infinity;
      const max = rest.max !== undefined ? Number(rest.max) : Infinity;

      const stepStr = String(step);
      const decimals = stepStr.includes(".") ? stepStr.split(".")[1].length : 0;
      const factor = 10 ** decimals;

      let nextVal = isNaN(currentVal)
        ? min !== -Infinity
          ? min
          : 0
        : Math.round((currentVal + direction * step) * factor) / factor;
      if (nextVal < min) nextVal = min;
      if (nextVal > max) nextVal = max;

      if (el) {
        el.value = String(nextVal);
      }

      if (rest.onChange) {
        const syntheticEvent = {
          target: { value: String(nextVal), name: rest.name },
          currentTarget: { value: String(nextVal), name: rest.name },
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.ChangeEvent<HTMLInputElement>;
        rest.onChange(syntheticEvent);
      }
    };

    const sizeClasses =
      inputSize === "sm" ? "h-7 text-xs px-2.5" : "h-8 text-xs px-3";

    const variantClasses =
      variant === "surface"
        ? "bg-slate-900 border-slate-800"
        : "bg-slate-950 border-slate-800";

    const errorClasses = error
      ? "border-rose-500/80 focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30"
      : "focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30";

    const hasLeftIcon = Boolean(leftIcon);
    const hasRightIcon = Boolean(rightIcon);

    const hasWrapper = Boolean(label || error || helperText);
    const hasCustomWidth = /\bw-/.test(containerClassName);
    const widthClass = hasCustomWidth ? "" : "w-full";

    const inputElement = (
      <div
        className={`relative flex items-center ${
          hasWrapper ? "w-full" : `${widthClass} ${containerClassName}`
        }`}
      >
        {hasLeftIcon && (
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center text-slate-500">
            {leftIcon}
          </div>
        )}
        <input
          ref={setRef}
          disabled={disabled}
          className={`w-full rounded-lg border text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none hover:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-950/60 ${sizeClasses} ${variantClasses} ${errorClasses} ${
            hasLeftIcon ? "pl-8" : ""
          } ${showNumberStepper ? "pr-6" : hasRightIcon ? "pr-8" : ""} ${inputClassName} ${className}`}
          {...rest}
        />
        {hasRightIcon && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center text-slate-400">
            {rightIcon}
          </div>
        )}
        {showNumberStepper && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center h-[calc(100%-6px)] w-4 select-none">
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (rest.max !== undefined && Number(rest.value ?? internalRef.current?.value) >= Number(rest.max))}
              onClick={() => handleStep(1)}
              className="w-full flex-1 flex items-center justify-center text-slate-400 hover:text-sky-300 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled || (rest.min !== undefined && Number(rest.value ?? internalRef.current?.value) <= Number(rest.min))}
              onClick={() => handleStep(-1)}
              className="w-full flex-1 flex items-center justify-center text-slate-400 hover:text-sky-300 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );

    if (!hasWrapper) {
      return inputElement;
    }

    return (
      <div className={`space-y-1 ${widthClass} ${containerClassName}`}>
        {(label || labelExtra) && (
          <div className="flex items-center justify-between text-slate-300 font-medium">
            {label && <label className="block">{label}</label>}
            {labelExtra && <div>{labelExtra}</div>}
          </div>
        )}
        {inputElement}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
        {helperText && !error && (
          <p className="text-[11px] text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
