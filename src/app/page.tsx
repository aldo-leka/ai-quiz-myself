"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircularButton } from "@/components/quiz/CircularButton";

export default function HomePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function playRandomQuiz() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quiz/random?mode=wwtbam", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No hub quiz is available yet.");
      }

      const payload = (await response.json()) as { quiz: { id: string } };
      router.push(`/play/${payload.quiz.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a random quiz.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <main className="w-full max-w-2xl space-y-8 rounded-3xl border border-slate-700 bg-gradient-to-b from-slate-900 to-slate-950 p-8 text-center shadow-2xl md:p-12">
        <p className="text-lg font-semibold tracking-[0.2em] text-cyan-300 uppercase">Quiz Show Night</p>
        <h1 className="text-5xl font-black tracking-tight md:text-7xl">QuizPlus</h1>
        <p className="text-xl text-slate-300 md:text-2xl">
          Big questions. Big pressure. One million at the top.
        </p>

        <div className="flex justify-center">
          <CircularButton
            className="h-24 w-24 text-base md:h-28 md:w-28 md:text-lg"
            onClick={() => void playRandomQuiz()}
            disabled={isLoading}
          >
            {isLoading ? "Loading" : "Play Random Quiz"}
          </CircularButton>
        </div>

        {error ? <p className="text-lg font-semibold text-rose-300">{error}</p> : null}

        <p className="text-base text-slate-400">Use arrow keys and Enter when you start the game.</p>
      </main>
    </div>
  );
}
