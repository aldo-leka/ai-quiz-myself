"use client";

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
  return (
    <section className="rounded-3xl border border-[#252940] bg-[#1a1d2e]/86 p-5 md:p-8">
      <div className="space-y-4 md:flex md:flex-wrap md:items-center md:gap-4 md:space-y-0">
        <h1 className="text-[clamp(2.5rem,4.6vw,4.75rem)] leading-[0.95] font-black tracking-tight text-[#e4e4e9]">
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
          size="lg"
          className="hidden md:inline-flex"
        />
      </div>
    </section>
  );
}
