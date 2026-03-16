import { ArrowRight } from "lucide-react";
import { PostHogLink } from "@/components/posthog/posthog-link";
import { QuizCard } from "@/components/quiz/QuizCard";
import type { PublicQuizCard } from "@/lib/public-quizzes";
import { buildPublicQuizPath } from "@/lib/quiz-links";

type FeaturedQuizGridProps = {
  title: string;
  description: string;
  quizzes: PublicQuizCard[];
  browseHref?: string;
  browseLabel?: string;
  trackingPage?: string;
};

export function FeaturedQuizGrid({
  title,
  description,
  quizzes,
  browseHref = "/hub",
  browseLabel = "Browse the full hub",
  trackingPage = "unknown",
}: FeaturedQuizGridProps) {
  return (
    <section className="space-y-5 rounded-[2rem] border border-[#252940] bg-[#111421]/82 p-6 md:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
            Featured Games
          </p>
          <h2 className="text-[clamp(2.2rem,5vw,4rem)] leading-[0.94] font-black tracking-tight text-[#e4e4e9]">
            {title}
          </h2>
          <p className="max-w-3xl text-lg text-[#b9bbca] md:text-xl">{description}</p>
        </div>
        <PostHogLink
          href={browseHref}
          eventName="featured_quiz_browse_clicked"
          eventProperties={{
            page: trackingPage,
            section_title: title,
            destination_path: browseHref,
          }}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/12 px-5 text-base font-semibold text-[#e4e4e9] transition hover:bg-[#6c8aff]/18"
        >
          {browseLabel}
          <ArrowRight className="size-4" />
        </PostHogLink>
      </div>

      {quizzes.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => (
            <PostHogLink
              key={quiz.id}
              href={buildPublicQuizPath(quiz.id)}
              eventName="featured_quiz_clicked"
              eventProperties={{
                page: trackingPage,
                section_title: title,
                quiz_id: quiz.id,
                quiz_theme: quiz.theme,
                game_mode: quiz.gameMode,
              }}
              className="block"
            >
              <QuizCard
                title={quiz.title}
                theme={quiz.theme}
                difficulty={quiz.difficulty}
                gameMode={quiz.gameMode}
                generationProvider={quiz.generationProvider}
                questionCount={quiz.questionCount}
                playCount={quiz.playCount}
                likeRatio={quiz.likeRatio}
                creatorName={quiz.creatorName}
                creatorImage={quiz.creatorImage}
                statusLabel="Ready"
                showRating
                className="h-full hover:border-[#6c8aff]/45 hover:bg-[#1a1d2e]"
              />
            </PostHogLink>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-[#252940] bg-[#0f1117]/82 p-6 text-lg text-[#b9bbca]">
          No featured quizzes are live for this page yet.
        </div>
      )}
    </section>
  );
}
