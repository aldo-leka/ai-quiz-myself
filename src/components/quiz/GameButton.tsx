"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const gameButtonVariants = cva(
  "min-h-[4.5rem] w-full rounded-2xl border-2 px-5 py-4 text-left text-lg leading-tight font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#818cf8]/70 md:min-h-20 md:text-xl",
  {
    variants: {
      state: {
        default: "border-[#252940] bg-[#1a1d2e] text-[#e4e4e9]",
        selected: "border-[#818cf8]/60 bg-[#6c8aff]/18 text-[#e4e4e9]",
        orange: "border-[#fbbf24]/60 bg-[#fbbf24]/18 text-[#e4e4e9]",
        correct: "border-[#4ade80]/60 bg-[#4ade80]/16 text-[#e4e4e9]",
        wrong: "border-[#f87171]/60 bg-[#f87171]/16 text-[#e4e4e9]",
      },
      focused: {
        true: "ring-4 ring-[#818cf8]/70",
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
    iconOnly?: boolean;
  };

export const GameButton = forwardRef<HTMLButtonElement, GameButtonProps>(function GameButton(
  {
    className,
    state,
    focused,
    centered,
    icon,
    iconOnly = false,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        gameButtonVariants({ state, focused, centered }),
        iconOnly && "flex items-center justify-center",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex items-center gap-2",
          (centered || iconOnly) && "justify-center",
          iconOnly && "w-full gap-0",
        )}
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        {children ? <span>{children}</span> : null}
      </span>
    </button>
  );
});
