import type { Metadata } from "next";
import { UseCasePage } from "@/components/marketing/use-case-page";
import { getHubQuizCards } from "@/lib/public-quizzes";
import { buildCreateQuizPath, buildCreateQuizSignInPath } from "@/lib/quiz-links";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Millionaire Game Online",
  description:
    "Play a millionaire-style trivia game online with custom questions, host audio, and escalating difficulty in QuizPlus.",
  alternates: {
    canonical: "/millionaire-game-online",
  },
};

export default async function MillionaireGameOnlinePage() {
  const [session, featuredQuizzes] = await Promise.all([
    getUserSessionOrNull(),
    getHubQuizCards({ mode: "wwtbam", limit: 3, sort: "popular" }),
  ]);

  const createHref = session?.user?.id
    ? buildCreateQuizPath({
        sourceType: "theme",
        theme: "General knowledge showdown",
        mode: "wwtbam",
      })
    : buildCreateQuizSignInPath({
        sourceType: "theme",
        theme: "General knowledge showdown",
        mode: "wwtbam",
      });

  return (
    <UseCasePage
      eyebrow="Millionaire Game Online"
      title="Use QuizPlus when you want a millionaire-style round, not just a plain question list."
      description="QuizPlus already supports a WWTBAM mode with escalating difficulty and host-style audio, so you can turn a normal quiz topic into something that feels much closer to a quiz show round."
      ctaHref={createHref}
      ctaLabel="Make a millionaire round"
      secondaryHref="/hub"
      secondaryLabel="Browse WWTBAM quizzes"
      bulletPoints={[
        "The strongest use case is one player in the hot seat while everyone else watches or debates.",
        "Use a focused topic for a themed round instead of a generic trivia bucket.",
        "Choose this mode when presentation matters as much as the questions.",
      ]}
      highlights={[
        {
          title: "Show format",
          description: "The millionaire-style presentation changes the feel of the game, not just the colors around the questions.",
        },
        {
          title: "Custom topics",
          description: "You can make the round about your own theme instead of relying on a fixed trivia catalog.",
        },
        {
          title: "Replayable",
          description: "Once one theme works, generate another millionaire round for a different audience or difficulty band.",
        },
        {
          title: "Search intent fit",
          description: "If you want quiz-show energy instead of a plain study screen, this mode is the shortest path there.",
        },
      ]}
      featuredTitle="Millionaire-style quizzes live now"
      featuredDescription="These public WWTBAM quizzes show the exact play style and pacing this mode is built for."
      featuredQuizzes={featuredQuizzes}
      trackingPage="millionaire_game_online"
    />
  );
}
