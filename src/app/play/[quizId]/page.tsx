"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";
import { LoadingScreen } from "@/components/quiz/LoadingScreen";
import { SinglePlayerGame } from "@/components/quiz/SinglePlayerGame";
import { WwtbamGame } from "@/components/quiz/WwtbamGame";
import type { QuizWithQuestions } from "@/lib/quiz-types";

export default function PlayQuizPage() {
  const params = useParams<{ quizId: string }>();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizWithQuestions | null>(null);

  useEffect(() => {
    const quizId = params.quizId;
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
  }, [params.quizId]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (loadError || !quiz) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div className="max-w-xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
          <h1 className="text-3xl font-bold">Quiz unavailable</h1>
          <p className="text-lg text-slate-300">{loadError ?? "Could not load this quiz."}</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <CircularButton onClick={() => router.refresh()}>Retry</CircularButton>
            <CircularButton onClick={() => router.push("/")}>Home</CircularButton>
          </div>
        </div>
      </div>
    );
  }

  if (quiz.gameMode === "wwtbam") {
    return <WwtbamGame quiz={quiz} />;
  }

  if (quiz.gameMode === "single") {
    return <SinglePlayerGame quiz={quiz} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
        <h1 className="text-3xl font-bold md:text-4xl">Couch Co-op</h1>
        <p className="text-lg text-slate-300 md:text-xl">Coming soon. This mode is next in the queue.</p>
        <div className="flex justify-center">
          <CircularButton onClick={() => router.push("/")}>Home</CircularButton>
        </div>
      </div>
    </div>
  );
}
