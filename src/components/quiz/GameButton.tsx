"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const gameButtonVariants = cva(
  "min-h-16 w-full rounded-xl border-2 px-4 py-3 text-left text-base leading-tight font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300",
  {
    variants: {
      state: {
        default: "border-slate-700 bg-slate-900 text-slate-100",
        selected: "border-slate-400 bg-slate-700 text-white",
        orange: "border-orange-300 bg-orange-500 text-white",
        correct: "border-emerald-300 bg-emerald-600 text-white",
      },
      focused: {
        true: "ring-4 ring-amber-300",
        false: "",
      },
      centered: {
        true: "text-center",
        false: "",
      },
    },
    defaultVariants: {
      state: "default",
      focused: false,
      centered: false,
    },
  },
);

type GameButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof gameButtonVariants> & {
    icon?: React.ReactNode;
  };

export function GameButton({
  className,
  state,
  focused,
  centered,
  icon,
  children,
  ...props
}: GameButtonProps) {
  return (
    <button className={cn(gameButtonVariants({ state, focused, centered }), className)} {...props}>
      <span className={cn("flex items-center gap-2", centered && "justify-center")}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span>{children}</span>
      </span>
    </button>
  );
}
