import { redirect } from "next/navigation";
import { ArrowRight, FileText, Link2, Sparkles, Tv, Users, UserRound } from "lucide-react";
import { FeaturedQuizGrid } from "@/components/marketing/featured-quiz-grid";
import { PostHogLink } from "@/components/posthog/posthog-link";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import {
  resolveGenerationCostCentsFromSettings,
  resolveStarterCreditsCentsFromSettings,
} from "@/lib/billing";
import { getHubQuizCards } from "@/lib/public-quizzes";
import {
  buildCreateQuizSignInPath,
  computeIncludedQuizCount,
} from "@/lib/quiz-links";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const metadata = {
  title: "Custom Trivia Games For Solo Play, Parties, And PDF Quiz Nights",
  description:
    "Create instant trivia from a topic, article, or PDF, then play solo, couch co-op, or a millionaire-style round on QuizPlus.",
  alternates: {
    canonical: "/",
  },
};

export default async function LandingPage() {
  const session = await getUserSessionOrNull();

  if (session?.user?.id) {
    redirect("/hub");
  }

  const [featuredQuizzes, settings] = await Promise.all([
    getHubQuizCards({ limit: 6, sort: "popular" }),
    db
      .select({
        key: platformSettings.key,
        value: platformSettings.value,
      })
      .from(platformSettings),
  ]);

  const generationCostCents = resolveGenerationCostCentsFromSettings(settings);
  const starterCreditsCents = resolveStarterCreditsCentsFromSettings(settings);
  const includedQuizCount = computeIncludedQuizCount(starterCreditsCents, generationCostCents);

  const openCreatorHref = buildCreateQuizSignInPath();
  const createThemeHref = buildCreateQuizSignInPath({
    sourceType: "theme",
    theme: "World football rivalries",
    mode: "couch_coop",
    difficulty: "mixed",
  });
  const createUrlHref = buildCreateQuizSignInPath({
    sourceType: "url",
    mode: "single",
    difficulty: "mixed",
  });
  const createPdfHref = buildCreateQuizSignInPath({
    sourceType: "pdf",
    mode: "single",
    difficulty: "mixed",
  });

  return (
    <div className="min-h-screen bg-[#0b0e17] px-4 py-6 text-[#e4e4e9] md:px-8 md:py-8">
      <main className="mx-auto flex w-full max-w-[1550px] flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-[#252940] bg-[radial-gradient(circle_at_top_left,_rgba(108,138,255,0.28),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(24,201,170,0.12),_transparent_24%),linear-gradient(135deg,_rgba(26,29,46,0.98),_rgba(10,12,19,0.97))] p-6 md:p-9 xl:p-12">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(23rem,0.8fr)]">
            <div className="space-y-6">
              <div className="space-y-4">
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#9ca0b5]">
                  Instant custom trivia
                </p>
                <h1 className="max-w-4xl text-[clamp(3rem,7vw,6.6rem)] leading-[0.9] font-black tracking-tight text-[#f5f7ff]">
                  Turn any topic, article, or PDF into a trivia night worth sharing.
                </h1>
                <p className="max-w-3xl text-lg text-[#c7cada] md:text-2xl">
                  Play solo, pass the phone in couch co-op, or run a millionaire-style round with
                  host audio. Build your own quiz in minutes, then send people straight into the game.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <PostHogLink
                  href={openCreatorHref}
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "open_creator",
                    destination_path: openCreatorHref,
                  }}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border border-[#6c8aff]/45 bg-[#6c8aff]/18 px-6 text-lg font-semibold text-[#f5f7ff] transition hover:bg-[#6c8aff]/24"
                >
                  Open the quiz creator
                  <ArrowRight className="size-5" />
                </PostHogLink>
                <PostHogLink
                  href="/hub"
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "browse_hub",
                    destination_path: "/hub",
                  }}
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-[#252940] bg-[#121625]/92 px-6 text-lg font-semibold text-[#e4e4e9] transition hover:border-[#6c8aff]/45 hover:bg-[#1a1d2e]"
                >
                  Browse the hub
                </PostHogLink>
              </div>

              <div className="flex flex-wrap gap-3">
                <PostHogLink
                  href="/birthday-trivia-game"
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "birthday_trivia_game",
                    destination_path: "/birthday-trivia-game",
                  }}
                  className="rounded-full border border-[#252940] bg-[#121625]/85 px-4 py-2 text-sm font-semibold text-[#dce0ef] transition hover:border-[#6c8aff]/45"
                >
                  Birthday trivia game
                </PostHogLink>
                <PostHogLink
                  href="/movie-trivia-night"
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "movie_trivia_night",
                    destination_path: "/movie-trivia-night",
                  }}
                  className="rounded-full border border-[#252940] bg-[#121625]/85 px-4 py-2 text-sm font-semibold text-[#dce0ef] transition hover:border-[#6c8aff]/45"
                >
                  Movie trivia night
                </PostHogLink>
                <PostHogLink
                  href="/millionaire-game-online"
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "millionaire_game_online",
                    destination_path: "/millionaire-game-online",
                  }}
                  className="rounded-full border border-[#252940] bg-[#121625]/85 px-4 py-2 text-sm font-semibold text-[#dce0ef] transition hover:border-[#6c8aff]/45"
                >
                  Millionaire game online
                </PostHogLink>
                <PostHogLink
                  href="/quiz-from-pdf"
                  eventName="landing_cta_clicked"
                  eventProperties={{
                    page: "landing",
                    cta_id: "quiz_from_pdf",
                    destination_path: "/quiz-from-pdf",
                  }}
                  className="rounded-full border border-[#252940] bg-[#121625]/85 px-4 py-2 text-sm font-semibold text-[#dce0ef] transition hover:border-[#6c8aff]/45"
                >
                  Make a quiz from PDF
                </PostHogLink>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.75rem] border border-[#252940] bg-[#0f1117]/82 p-6">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
                  New Player Offer
                </p>
                <p className="mt-4 text-[clamp(2.7rem,6vw,4.6rem)] leading-none font-black text-[#f5f7ff]">
                  {includedQuizCount > 0 ? `${includedQuizCount} free custom quizzes` : `$${(generationCostCents / 100).toFixed(2)} each`}
                </p>
                <p className="mt-4 text-lg text-[#c7cada] md:text-xl">
                  Right now custom quiz generation costs ${(generationCostCents / 100).toFixed(2)}
                  {" "}
                  each, and new signups start with ${(starterCreditsCents / 100).toFixed(2)} in
                  bonus balance.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-[1.75rem] border border-[#252940] bg-[#0f1117]/82 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
                    <Users className="size-4 text-[#818cf8]" />
                    Couch Co-op
                  </p>
                  <p className="mt-3 text-xl font-bold text-[#f5f7ff]">Pass the device around and keep score locally.</p>
                </div>
                <div className="rounded-[1.75rem] border border-[#252940] bg-[#0f1117]/82 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
                    <Tv className="size-4 text-[#818cf8]" />
                    WWTBAM
                  </p>
                  <p className="mt-3 text-xl font-bold text-[#f5f7ff]">Give one quiz a full quiz-show presentation.</p>
                </div>
                <div className="rounded-[1.75rem] border border-[#252940] bg-[#0f1117]/82 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-[#9394a5]">
                    <UserRound className="size-4 text-[#818cf8]" />
                    Solo Play
                  </p>
                  <p className="mt-3 text-xl font-bold text-[#f5f7ff]">Practice, study, or speedrun a category alone.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <PostHogLink
            href={createThemeHref}
            eventName="landing_cta_clicked"
            eventProperties={{
              page: "landing",
              cta_id: "from_topic",
              destination_path: createThemeHref,
            }}
            className="rounded-[1.75rem] border border-[#252940] bg-[#121625]/92 p-6 transition hover:border-[#6c8aff]/45 hover:bg-[#171b2a]"
          >
            <div className="inline-flex rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-3">
              <Sparkles className="size-6 text-[#818cf8]" />
            </div>
            <p className="mt-5 text-3xl font-black text-[#f5f7ff]">From a topic</p>
            <p className="mt-3 text-lg text-[#b8bdd0]">
              Best for public topics the model can reasonably know already, like sports rivalries,
              movie franchises, or study subjects.
            </p>
          </PostHogLink>

          <PostHogLink
            href={createUrlHref}
            eventName="landing_cta_clicked"
            eventProperties={{
              page: "landing",
              cta_id: "from_url",
              destination_path: createUrlHref,
            }}
            className="rounded-[1.75rem] border border-[#252940] bg-[#121625]/92 p-6 transition hover:border-[#6c8aff]/45 hover:bg-[#171b2a]"
          >
            <div className="inline-flex rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-3">
              <Link2 className="size-6 text-[#818cf8]" />
            </div>
            <p className="mt-5 text-3xl font-black text-[#f5f7ff]">From a URL</p>
            <p className="mt-3 text-lg text-[#b8bdd0]">
              Turn an article, wiki page, or match recap into a quiz without writing the questions yourself.
            </p>
          </PostHogLink>

          <PostHogLink
            href={createPdfHref}
            eventName="landing_cta_clicked"
            eventProperties={{
              page: "landing",
              cta_id: "from_pdf",
              destination_path: createPdfHref,
            }}
            className="rounded-[1.75rem] border border-[#252940] bg-[#121625]/92 p-6 transition hover:border-[#6c8aff]/45 hover:bg-[#171b2a]"
          >
            <div className="inline-flex rounded-2xl border border-[#6c8aff]/35 bg-[#6c8aff]/12 p-3">
              <FileText className="size-6 text-[#818cf8]" />
            </div>
            <p className="mt-5 text-3xl font-black text-[#f5f7ff]">From a PDF</p>
            <p className="mt-3 text-lg text-[#b8bdd0]">
              Upload a study guide, event brief, birthday notes, or private lore and turn it into
              something your group can actually play.
            </p>
          </PostHogLink>
        </section>

        <FeaturedQuizGrid
          title="Play something right now"
          description="Try a few public quizzes first, then make your own when you know which mode fits your group."
          quizzes={featuredQuizzes}
          trackingPage="landing"
        />
      </main>
    </div>
  );
}
