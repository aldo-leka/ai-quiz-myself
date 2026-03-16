import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FeaturedQuizGrid } from "@/components/marketing/featured-quiz-grid";
import type { PublicQuizCard } from "@/lib/public-quizzes";

type UseCasePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  bulletPoints: string[];
  highlights: Array<{
    title: string;
    description: string;
  }>;
  featuredTitle: string;
  featuredDescription: string;
  featuredQuizzes: PublicQuizCard[];
};

export function UseCasePage({
  eyebrow,
  title,
  description,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
  bulletPoints,
  highlights,
  featuredTitle,
  featuredDescription,
  featuredQuizzes,
}: UseCasePageProps) {
  return (
    <div className="min-h-screen bg-[#0b0e17] px-4 py-6 text-[#e4e4e9] md:px-8 md:py-8">
      <main className="mx-auto w-full max-w-[1500px] space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#252940] bg-[radial-gradient(circle_at_top_left,_rgba(108,138,255,0.22),_transparent_36%),linear-gradient(135deg,_rgba(26,29,46,0.97),_rgba(11,14,23,0.96))] p-6 md:p-9 xl:p-12">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(21rem,0.75fr)]">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#9ca0b5]">
                {eyebrow}
              </p>
              <div className="space-y-4">
                <h1 className="max-w-4xl text-[clamp(2.8rem,6vw,5.8rem)] leading-[0.92] font-black tracking-tight text-[#f5f7ff]">
                  {title}
                </h1>
                <p className="max-w-3xl text-lg text-[#c7cada] md:text-2xl">{description}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={ctaHref}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg font-semibold text-[#f5f7ff] transition hover:bg-[#6c8aff]/24"
                >
                  {ctaLabel}
                  <ArrowRight className="size-5" />
                </Link>
                <Link
                  href={secondaryHref}
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#252940] bg-[#121625]/92 px-6 text-lg font-semibold text-[#e4e4e9] transition hover:border-[#6c8aff]/45 hover:bg-[#1a1d2e]"
                >
                  {secondaryLabel}
                </Link>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-[#252940] bg-[#0f1117]/82 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
                Works Best When
              </p>
              <div className="space-y-3">
                {bulletPoints.map((bullet) => (
                  <div
                    key={bullet}
                    className="rounded-2xl border border-[#252940] bg-[#151927]/92 px-4 py-3 text-base text-[#d5d8e6] md:text-lg"
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlights.map((highlight) => (
            <div
              key={highlight.title}
              className="rounded-[1.75rem] border border-[#252940] bg-[#121625]/92 p-5"
            >
              <p className="text-2xl font-bold text-[#f5f7ff]">{highlight.title}</p>
              <p className="mt-3 text-base text-[#b8bdd0] md:text-lg">{highlight.description}</p>
            </div>
          ))}
        </section>

        <FeaturedQuizGrid
          title={featuredTitle}
          description={featuredDescription}
          quizzes={featuredQuizzes}
        />
      </main>
    </div>
  );
}
