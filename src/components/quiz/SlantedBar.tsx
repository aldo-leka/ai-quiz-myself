"use client";

import { cn } from "@/lib/utils";

const TRACK_CLIP_PATH = "polygon(1.8% 0%, 100% 0%, 98.2% 100%, 0% 100%)";
const FILL_CLIP_PATH = "polygon(0% 0%, 100% 0%, 97.5% 100%, 0% 100%)";

type SlantedBarProps = {
  value: number;
  className?: string;
  fillClassName?: string;
};

export function SlantedBar({ value, className, fillClassName }: SlantedBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("overflow-hidden border border-[#252940] bg-[#0f1117]/88", className)}
      style={{ clipPath: TRACK_CLIP_PATH }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampedValue)}
    >
      <div
        className={cn("h-full transition-[width] duration-1000", fillClassName)}
        style={{
          width: `${clampedValue}%`,
          clipPath: FILL_CLIP_PATH,
        }}
      />
    </div>
  );
}
