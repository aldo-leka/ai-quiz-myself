"use client";

import { Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type QuizCreatorAttributionProps = {
  creatorName?: string | null;
  creatorImage?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
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
  const isLarge = size === "lg";

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-full border text-[#e4e4e9]",
        isCompact
          ? "min-h-8 gap-1.5 border-[#6c8aff]/35 bg-[#6c8aff]/12 pl-3 pr-9 text-sm"
          : isLarge
            ? "min-h-12 gap-2.5 border-[#6c8aff]/40 bg-[#6c8aff]/12 pl-5 pr-14 text-base md:min-h-14 md:text-xl"
            : "min-h-10 gap-2 border-[#6c8aff]/40 bg-[#6c8aff]/12 pl-4 pr-12 text-base",
        className,
      )}
    >
      <Sparkles
        className={cn(
          "shrink-0 text-[#818cf8]",
          isCompact ? "size-5" : isLarge ? "size-6 md:size-7" : "size-6",
        )}
        strokeWidth={1.8}
      />
      <span className="font-medium text-[#9394a5]">{label}</span>
      <span
        className={cn(
          "truncate text-[#e4e4e9]",
          isCompact ? "max-w-[10rem]" : isLarge ? "max-w-[20rem]" : "max-w-[17rem]",
        )}
      >
        {creatorName}
      </span>
      <Avatar
        className={cn(
          "absolute top-1/2 -translate-y-1/2 overflow-hidden border border-[#818cf8]/35 bg-[#1a1d2e]/86 shadow-none",
          isCompact ? "right-1 size-6" : isLarge ? "right-2 size-8 md:size-9" : "right-1.5 size-7",
        )}
      >
        <AvatarImage src={creatorImage ?? undefined} alt={creatorName} className="object-cover" />
        <AvatarFallback
          className={cn(
            "bg-[#252940] font-semibold text-[#e4e4e9]",
            isCompact ? "text-[10px]" : isLarge ? "text-xs md:text-sm" : "text-[11px]",
          )}
        >
          {creatorInitials(creatorName)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
