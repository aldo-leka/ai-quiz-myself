"use client";

import { cn } from "@/lib/utils";

type CircularButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  focused?: boolean;
};

export function CircularButton({
  className,
  selected = false,
  focused = false,
  children,
  ...props
}: CircularButtonProps) {
  return (
    <button
      className={cn(
        "size-16 min-h-16 min-w-16 rounded-full border-2 text-sm font-semibold transition md:size-20",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300",
        selected
          ? "border-slate-300 bg-slate-600 text-white"
          : "border-slate-700 bg-slate-900 text-slate-100",
        focused && "ring-4 ring-amber-300",
        props.disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
