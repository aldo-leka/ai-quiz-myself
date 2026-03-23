import type { Metadata } from "next";
import { UseCasePage } from "@/components/marketing/use-case-page";
import { getHubQuizCards } from "@/lib/public-quizzes";
import { buildCreateQuizPath, buildCreateQuizSignInPath } from "@/lib/quiz-links";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movie Trivia Night",
  description:
    "Make a movie trivia night quiz from a genre, franchise, actor, or article, then play it in couch co-op or solo on QuizPlus.",
  alternates: {
    canonical: "/movie-trivia-night",
  },
};

export default async function MovieTriviaNightPage() {
  const [session, movieQuizzes, fallbackQuizzes] = await Promise.all([
    getUserSessionOrNull(),
    getHubQuizCards({ themeSearch: "movie", limit: 3, sort: "popular" }),
    getHubQuizCards({ mode: "couch_coop", limit: 3, sort: "popular" }),
  ]);
  const featuredQuizzes = movieQuizzes.length > 0 ? movieQuizzes : fallbackQuizzes;

  const createHref = session?.user?.id
    ? buildCreateQuizPath({
        sourceType: "theme",
        theme: "Movie trivia night",
        mode: "couch_coop",
        difficulty: "mixed",
      })
    : buildCreateQuizSignInPath({
        sourceType: "theme",
        theme: "Movie trivia night",
        mode: "couch_coop",
        difficulty: "mixed",
      });

  return (
    <UseCasePage
      eyebrow="Movie Trivia Night"
      title="Run a movie trivia night without writing all the questions yourself."
      description="Movie nights are a strong fit because people already arrive with opinions, franchises, and quote memory. Start from a film theme, director, actor, or article, then let QuizPlus turn that into a couch co-op or solo game."
      ctaHref={createHref}
      ctaLabel="Make a movie quiz"
      secondaryHref="/hub"
      secondaryLabel="Play public quizzes"
      bulletPoints={[
        "Pick one franchise, one decade, or one actor instead of trying to cover cinema as a whole.",
        "Couch co-op works well for living room play when people are taking turns.",
        "Use solo mode when you want a tighter speedrun or study-style challenge.",
      ]}
      highlights={[
        {
          title: "Theme-friendly",
          description: "Movie quizzes are easy to scope tightly, which usually improves question quality and replay value.",
        },
        {
          title: "Better than generic trivia",
          description: "A dedicated movie round hits harder than a random mixed-knowledge party quiz if the room already cares about film.",
        },
        {
          title: "Public-source friendly",
          description: "Movie topics are public enough that a theme prompt can usually generate something coherent without extra source prep.",
        },
        {
          title: "Room for iteration",
          description: "After one round, spin up a sequel with a new genre or harder difficulty instead of starting over from scratch.",
        },
      ]}
      featuredTitle="Movie-friendly public quizzes"
      featuredDescription="These public quizzes are close to the entertainment-night vibe this page is built for and make good warm-up rounds."
      featuredQuizzes={featuredQuizzes}
      trackingPage="movie_trivia_night"
    />
  );
}
