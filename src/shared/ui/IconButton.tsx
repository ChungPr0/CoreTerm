import React, { forwardRef } from "react";

export type IconButtonTone = "default" | "sky" | "rose" | "emerald" | "amber";
export type IconButtonSize = "xs" | "sm" | "md" | "lg";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  bordered?: boolean;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      children,
      tone = "default",
      size = "md",
      bordered = false,
      active = false,
      type = "button",
      tabIndex = -1,
      className = "",
      disabled = false,
      title,
      "aria-label": ariaLabel,
      ...rest
    },
    ref
  ) => {
    const toneClasses = active
      ? {
          default: "bg-slate-700/80 text-slate-100 border-slate-600",
          sky: "border-sky-500/50 bg-sky-500/20 text-sky-300",
          rose: "border-rose-500/50 bg-rose-500/20 text-rose-300",
          emerald: "border-emerald-500/50 bg-emerald-500/20 text-emerald-300",
          amber: "border-amber-500/50 bg-amber-500/20 text-amber-300",
        }[tone]
      : {
          default: bordered
            ? "hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200 text-slate-400"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800",
          sky: bordered
            ? "hover:border-sky-500/40 hover:bg-sky-500/15 hover:text-sky-300 text-slate-400"
            : "text-slate-400 hover:text-sky-300 hover:bg-slate-800",
          rose: bordered
            ? "hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-400 text-slate-400"
            : "text-slate-400 hover:text-rose-400 hover:bg-slate-800",
          emerald: bordered
            ? "hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-400 text-slate-400"
            : "text-slate-400 hover:text-emerald-300 hover:bg-slate-800",
          amber: bordered
            ? "hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-300 text-slate-400"
            : "text-slate-400 hover:text-amber-300 hover:bg-slate-800",
        }[tone];

    const sizeClasses = {
      xs: "h-5 w-5 rounded",
      sm: "h-6 w-6 rounded-md",
      md: "h-7 w-7 rounded-lg",
      lg: "h-8 w-8 rounded-lg",
    }[size];

    const borderClasses = active
      ? ""
      : bordered
        ? "border-slate-800/80 bg-slate-900/70"
        : "border-transparent";

    return (
      <button
        ref={ref}
        type={type}
        tabIndex={tabIndex}
        disabled={disabled}
        data-tooltip={title || undefined}
        aria-label={ariaLabel || title}
        className={`inline-flex items-center justify-center shrink-0 select-none transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 cursor-pointer border box-border disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none ${borderClasses} ${toneClasses} ${sizeClasses} ${className}`}
        {...rest}
      >
        {icon || children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
