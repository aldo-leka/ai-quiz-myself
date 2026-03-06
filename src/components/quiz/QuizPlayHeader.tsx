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
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black tracking-tight text-slate-100 md:text-4xl">{title}</h1>
        <QuizCreatorAttribution creatorName={creatorName} creatorImage={creatorImage} size="md" />
      </div>
    </section>
  );
}
