"use client";

import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type QuizCreatorAttributionProps = {
  creatorName?: string | null;
  creatorImage?: string | null;
  className?: string;
  size?: "sm" | "md";
  label?: string;
};

function creatorInitials(name: string | null | undefined): string {
  const parts = (name ?? "QuizPlus")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);

  if (parts.length === 0) return "Q";
  return parts.map((part) => part[0]!.toUpperCase()).join("");
}

export function QuizCreatorAttribution({
  creatorName,
  creatorImage,
  className,
  size = "sm",
  label = "by",
}: QuizCreatorAttributionProps) {
  if (!creatorName) {
    return null;
  }

  const isCompact = size === "sm";

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-full border text-slate-200",
        isCompact
          ? "min-h-8 gap-1.5 border-cyan-500/40 bg-cyan-500/10 pl-3 pr-9 text-sm"
          : "min-h-10 gap-2 border-cyan-500/45 bg-cyan-500/12 pl-4 pr-12 text-base",
        className,
      )}
    >
      <Sparkles
        className={cn(
          "shrink-0 text-cyan-200 drop-shadow-[0_0_10px_rgba(103,232,249,0.28)]",
          isCompact ? "size-5" : "size-6",
        )}
        strokeWidth={1.8}
      />
      <span className="font-medium text-cyan-100">{label}</span>
      <span
        className={cn(
          "truncate text-slate-100",
          isCompact ? "max-w-[10rem]" : "max-w-[17rem]",
        )}
      >
        {creatorName}
      </span>
      <Avatar
        className={cn(
          "absolute top-1/2 -translate-y-1/2 overflow-hidden border border-cyan-400/35 bg-slate-900/80 shadow-[0_0_14px_rgba(34,211,238,0.18)]",
          isCompact ? "right-1 size-6" : "right-1.5 size-7",
        )}
      >
        <AvatarImage src={creatorImage ?? undefined} alt={creatorName} className="object-cover" />
        <AvatarFallback
          className={cn(
            "bg-slate-800 font-semibold text-cyan-100",
            isCompact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {creatorInitials(creatorName)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
