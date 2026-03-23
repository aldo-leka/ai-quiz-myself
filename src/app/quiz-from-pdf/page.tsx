import type { Metadata } from "next";
import { UseCasePage } from "@/components/marketing/use-case-page";
import { getHubQuizCards } from "@/lib/public-quizzes";
import { buildCreateQuizPath, buildCreateQuizSignInPath } from "@/lib/quiz-links";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Make A Quiz From PDF",
  description:
    "Upload a PDF and turn it into a playable quiz for solo study, team review, or a live quiz night in QuizPlus.",
  alternates: {
    canonical: "/quiz-from-pdf",
  },
};

export default async function QuizFromPdfPage() {
  const [session, featuredQuizzes] = await Promise.all([
    getUserSessionOrNull(),
    getHubQuizCards({ limit: 3, sort: "popular" }),
  ]);

  const createHref = session?.user?.id
    ? buildCreateQuizPath({
        sourceType: "pdf",
        mode: "single",
        difficulty: "mixed",
      })
    : buildCreateQuizSignInPath({
        sourceType: "pdf",
        mode: "single",
        difficulty: "mixed",
      });

  return (
    <UseCasePage
      eyebrow="Quiz From PDF"
      title="Turn a PDF into a playable quiz instead of another passive reading session."
      description="Upload a PDF, let QuizPlus extract the material, and turn it into a game you can play or share. It works well for study guides, event briefs, handbooks, birthday notes, and slide exports."
      ctaHref={createHref}
      ctaLabel="Upload a PDF"
      secondaryHref="/hub"
      secondaryLabel="See live quiz examples"
      bulletPoints={[
        "Works best when the PDF already has structure: slides, sections, or a readable narrative.",
        "Use solo mode when the goal is recall, not a party format.",
        "Use couch co-op when you want a room to review the same material together.",
      ]}
      highlights={[
        {
          title: "Single upload",
          description: "You do not need to manually rewrite the source into prompt text before generating a quiz.",
        },
        {
          title: "Good for review",
          description: "A PDF quiz works when you want faster repetition than scrolling through the original document again.",
        },
        {
          title: "Playable output",
          description: "The end result is not just questions in a list. It drops into the same game modes as the hub.",
        },
        {
          title: "Good for private material",
          description: "PDF upload is the most honest path when the source includes details the model could not know on its own.",
        },
      ]}
      featuredTitle="Popular quizzes to try while you build"
      featuredDescription="These public quizzes show the kind of gameplay output you can expect after turning your own PDF into a round."
      featuredQuizzes={featuredQuizzes}
      trackingPage="quiz_from_pdf"
    />
  );
}
