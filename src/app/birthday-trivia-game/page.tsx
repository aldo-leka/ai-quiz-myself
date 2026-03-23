import type { Metadata } from "next";
import { UseCasePage } from "@/components/marketing/use-case-page";
import { getHubQuizCards } from "@/lib/public-quizzes";
import { buildCreateQuizPath, buildCreateQuizSignInPath } from "@/lib/quiz-links";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Birthday Trivia Game",
  description:
    "Make a birthday trivia game from family stories, friend lore, and favorite memories, then play it in couch co-op or quiz-show mode.",
  alternates: {
    canonical: "/birthday-trivia-game",
  },
};

export default async function BirthdayTriviaGamePage() {
  const [session, featuredQuizzes] = await Promise.all([
    getUserSessionOrNull(),
    getHubQuizCards({ mode: "couch_coop", limit: 3, sort: "popular" }),
  ]);

  const createHref = session?.user?.id
    ? buildCreateQuizPath({
        sourceType: "pdf",
        mode: "couch_coop",
        difficulty: "mixed",
      })
    : buildCreateQuizSignInPath({
        sourceType: "pdf",
        mode: "couch_coop",
        difficulty: "mixed",
      });

  return (
    <UseCasePage
      eyebrow="Birthday Trivia Game"
      title="Build a birthday quiz from notes, stories, and screenshots your group already has."
      description="For a real birthday quiz, gather the source material first. Drop shared memories, facts, screenshots, or mini writeups into a PDF, then let QuizPlus turn that into a couch co-op round that feels personal instead of generic."
      ctaHref={createHref}
      ctaLabel="Upload birthday notes"
      secondaryHref="/hub"
      secondaryLabel="Browse public games"
      bulletPoints={[
        "Collect your facts first, because the model cannot guess private birthday stories on its own.",
        "A simple PDF with bullet points, photos, captions, or screenshots is enough to start.",
        "Use couch co-op when everyone is in the same room and wants quick turns.",
        "Use millionaire mode later if you want one person in the spotlight.",
      ]}
      highlights={[
        {
          title: "Honest input",
          description: "Birthday trivia works best when you provide the raw material instead of hoping a generic theme prompt can infer it.",
        },
        {
          title: "Personal beats generic",
          description: "Birthday trivia works because the questions feel written for the guest list, not for search traffic.",
        },
        {
          title: "Low-friction play",
          description: "Once the source is ready, players can jump straight into the game without a heavy multiplayer setup flow.",
        },
        {
          title: "Easy second round",
          description: "After one birthday round lands well, upload a second source for a harder sequel or a different crowd.",
        },
      ]}
      featuredTitle="Popular party-ready quizzes"
      featuredDescription="These public quizzes show the play style and pacing that works well for a birthday room, even if your actual birthday facts come from a private PDF."
      featuredQuizzes={featuredQuizzes}
      trackingPage="birthday_trivia_game"
    />
  );
}
