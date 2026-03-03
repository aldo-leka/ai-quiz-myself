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
        "min-h-12 min-w-12 rounded-full border px-5 py-2 text-lg font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        isActive
          ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
          : "border-slate-700 bg-slate-900 text-slate-200",
        className,
      )}
    >
      {children}
    </button>
  );
}
