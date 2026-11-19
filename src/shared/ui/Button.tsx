import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "outline"
  | "ghost";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  active?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "secondary",
      size = "md",
      loading = false,
      active = false,
      leftIcon,
      rightIcon,
      disabled = false,
      className = "",
      type = "button",
      ...rest
    },
    ref
  ) => {
    const variantClasses = active
      ? "border-sky-500/50 bg-sky-500/20 text-sky-300 hover:bg-sky-500/25 font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-sky-500/50"
      : {
          primary:
            "border-transparent bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-slate-950 font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-sky-500/50",
          secondary:
            "border-slate-700/60 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-slate-200 font-medium focus-visible:ring-2 focus-visible:ring-slate-500/50",
          success:
            "border-transparent bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-500/50",
          danger:
            "border-transparent bg-rose-500 hover:bg-rose-400 active:bg-rose-600 text-white font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-rose-500/50",
          outline:
            "border-slate-700/80 hover:border-slate-600 bg-slate-950/60 hover:bg-slate-800 text-slate-200 font-medium focus-visible:ring-2 focus-visible:ring-slate-500/50",
          ghost:
            "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 font-medium focus-visible:ring-2 focus-visible:ring-slate-500/50",
        }[variant];

    const sizeClasses = {
      xs: "h-6 px-2 text-[11px] rounded-md gap-1",
      sm: "h-7 px-2.5 text-xs rounded-lg gap-1.5",
      md: "h-8 px-3.5 text-xs rounded-lg gap-1.5",
      lg: "h-9 px-4 text-sm rounded-lg gap-2",
      icon: "h-7 w-7 p-0 rounded-lg flex items-center justify-center",
    }[size];

    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center select-none whitespace-nowrap transition-colors duration-150 focus:outline-none cursor-pointer border box-border disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${variantClasses} ${sizeClasses} ${className}`}
        {...rest}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && rightIcon && (
          <span className="shrink-0 flex items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
