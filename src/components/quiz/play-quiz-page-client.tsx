"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CouchCoopGame } from "@/components/quiz/CouchCoopGame";
import { CircularButton } from "@/components/quiz/CircularButton";
import { LoadingScreen } from "@/components/quiz/LoadingScreen";
import { SinglePlayerGame } from "@/components/quiz/SinglePlayerGame";
import { WwtbamGame } from "@/components/quiz/WwtbamGame";
import { getMyQuizzesRandomPlaybackContextForQuiz } from "@/lib/my-quizzes-random-client";
import type { QuizWithQuestions } from "@/lib/quiz-types";

type PlayQuizPageClientProps = {
  quizId: string;
};

export function PlayQuizPageClient({ quizId }: PlayQuizPageClientProps) {
  const router = useRouter();
  const [playContext, setPlayContext] = useState(() =>
    getMyQuizzesRandomPlaybackContextForQuiz(quizId),
  );
  const homePath = playContext ? "/dashboard" : "/hub";

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null);

  useEffect(() => {
    setPlayContext(getMyQuizzesRandomPlaybackContextForQuiz(quizId));
  }, [quizId]);

  useEffect(() => {
    if (!quizId) return;

    let cancelled = false;

    async function loadQuiz() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/quiz/${quizId}`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load quiz");
        }

        const payload = (await response.json()) as { quiz: QuizWithQuestions };
        if (!payload.quiz.questions || payload.quiz.questions.length === 0) {
          throw new Error("Quiz has no questions");
        }

        if (!cancelled) {
          setQuiz(payload.quiz);
        }
      } catch (error) {
        if (!cancelled) {
          setQuiz(null);
          setLoadError(error instanceof Error ? error.message : "Failed to load quiz");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (loadError || !quiz) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-[#e4e4e9]">
        <div className="max-w-xl space-y-6 rounded-2xl border border-[#252940] bg-[#1a1d2e] p-8 text-center">
          <h1 className="text-3xl font-bold">Quiz unavailable</h1>
          <p className="text-lg text-[#9394a5]">{loadError ?? "Could not load this quiz."}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CircularButton onClick={() => router.refresh()}>Retry</CircularButton>
            <CircularButton onClick={() => router.push(homePath)}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  if (quiz.gameMode === "wwtbam") {
    return <WwtbamGame quiz={quiz} playContext={playContext} />;
  }

  if (quiz.gameMode === "single") {
    return <SinglePlayerGame quiz={quiz} playContext={playContext} />;
  }

  if (quiz.gameMode === "couch_coop") {
    return <CouchCoopGame quiz={quiz} playContext={playContext} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f1117] px-6 text-[#e4e4e9]">
      <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-[#252940] bg-[#1a1d2e] p-8 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Couch Co-op</h1>
        <p className="text-lg text-[#9394a5] md:text-xl">Coming soon. This mode is next in the queue.</p>
        <div className="flex justify-center">
          <CircularButton onClick={() => router.push(homePath)}>Home</CircularButton>
        </div>
      </div>
    </div>
  );
}
