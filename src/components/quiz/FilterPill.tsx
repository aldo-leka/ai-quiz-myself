"use client";

import { cn } from "@/lib/utils";

type FilterPillProps = {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
};

export function FilterPill({ isActive, onClick, children, className }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-14 min-w-12 max-w-full min-w-0 overflow-hidden truncate rounded-full border px-6 py-2.5 text-lg font-semibold whitespace-nowrap transition md:min-h-16 md:px-7 md:text-2xl",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1117]",
        isActive
          ? "border-[#818cf8]/55 bg-[#6c8aff]/18 text-[#e4e4e9]"
          : "border-[#252940] bg-[#1a1d2e] text-[#e4e4e9]",
        className,
      )}
    >
      {children}
    </button>
  );
}
