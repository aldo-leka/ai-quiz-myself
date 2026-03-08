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
        "size-16 min-h-16 min-w-16 rounded-full border-2 text-sm font-semibold transition md:size-24 md:min-h-24 md:min-w-24 md:text-lg",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8]/70",
        selected
          ? "border-[#818cf8]/60 bg-[#6c8aff]/18 text-[#e4e4e9]"
          : "border-[#252940] bg-[#1a1d2e] text-[#e4e4e9]",
        focused && "ring-4 ring-[#818cf8]/70",
        props.disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
