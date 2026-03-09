"use client";

import type { ReactNode, Ref } from "react";
import { GameButton } from "@/components/quiz/GameButton";
import { QuizCreatorAttribution } from "@/components/quiz/QuizCreatorAttribution";
import { useCompactQuizLayout } from "@/hooks/useCompactQuizLayout";
import { cn } from "@/lib/utils";

type QuizPlayHeaderProps = {
  title: string;
  creatorName?: string | null;
  creatorImage?: string | null;
  leftActionLabel?: string;
  leftActionOnClick?: () => void;
  leftActionDisabled?: boolean;
  leftActionIcon?: ReactNode;
  leftActionFocused?: boolean;
  leftActionButtonRef?: Ref<HTMLButtonElement>;
  rightActionLabel?: string;
  rightActionOnClick?: () => void;
  rightActionDisabled?: boolean;
  rightActionIcon?: ReactNode;
  rightActionFocused?: boolean;
  rightActionButtonRef?: Ref<HTMLButtonElement>;
};

export function QuizPlayHeader({
  title,
  creatorName,
  creatorImage,
  leftActionLabel,
  leftActionOnClick,
  leftActionDisabled,
  leftActionIcon,
  leftActionFocused,
  leftActionButtonRef,
  rightActionLabel,
  rightActionOnClick,
  rightActionDisabled,
  rightActionIcon,
  rightActionFocused,
  rightActionButtonRef,
}: QuizPlayHeaderProps) {
  const compactLayout = useCompactQuizLayout();

  return (
    <section
      className={cn(
        "rounded-3xl border border-[#252940] bg-[#1a1d2e]/86 p-4 md:p-8",
        compactLayout && "md:p-4",
      )}
    >
      <div
        className={cn(
          "grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start md:gap-4",
          compactLayout && "md:gap-3",
        )}
      >
        {leftActionLabel && leftActionOnClick && leftActionIcon ? (
          <GameButton
            centered
            className={cn(
              "order-2 aspect-square min-h-14 w-14 px-0 py-0 md:order-1 md:min-h-16 md:w-16",
              compactLayout && "md:min-h-14 md:w-14",
            )}
            aria-label={leftActionLabel}
            focused={leftActionFocused}
            iconOnly
            disabled={leftActionDisabled}
            onClick={leftActionOnClick}
            ref={leftActionButtonRef}
            title={leftActionLabel}
            icon={leftActionIcon}
          />
        ) : (
          <div className="hidden md:block" />
        )}

        <div className="order-1 min-w-0 space-y-3 md:order-2">
          <h1
            className={cn(
              "text-[clamp(1.9rem,8vw,4.75rem)] leading-[0.95] font-black tracking-tight text-[#e4e4e9]",
              compactLayout && "md:text-[clamp(1.55rem,3.8vw,3.2rem)]",
            )}
          >
            {title}
          </h1>
          <QuizCreatorAttribution
            creatorName={creatorName}
            creatorImage={creatorImage}
            size="md"
            className="w-fit md:hidden"
          />
          <QuizCreatorAttribution
            creatorName={creatorName}
            creatorImage={creatorImage}
            size={compactLayout ? "md" : "lg"}
            className="hidden md:inline-flex"
          />
        </div>

        {rightActionLabel && rightActionOnClick && rightActionIcon ? (
          <GameButton
            centered
            className={cn(
              "order-3 aspect-square min-h-14 w-14 justify-self-end px-0 py-0 md:min-h-16 md:w-16",
              compactLayout && "md:min-h-14 md:w-14",
            )}
            aria-label={rightActionLabel}
            focused={rightActionFocused}
            iconOnly
            disabled={rightActionDisabled}
            onClick={rightActionOnClick}
            ref={rightActionButtonRef}
            title={rightActionLabel}
            icon={rightActionIcon}
          />
        ) : (
          <div className="hidden md:block" />
        )}
      </div>
    </section>
  );
}
