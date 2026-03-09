"use client";

import { useCompactQuizLayout } from "@/hooks/useCompactQuizLayout";
import { cn } from "@/lib/utils";
import { QuizCreatorAttribution } from "@/components/quiz/QuizCreatorAttribution";

type QuizPlayHeaderProps = {
  title: string;
  creatorName?: string | null;
  creatorImage?: string | null;
};

export function QuizPlayHeader({
  title,
  creatorName,
  creatorImage,
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
          "space-y-3 md:flex md:flex-wrap md:items-center md:gap-4 md:space-y-0",
          compactLayout && "md:gap-3",
        )}
      >
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
    </section>
  );
}
