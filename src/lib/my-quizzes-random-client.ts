"use client";

import { getNextRecommendedQuizId, type RecentQuizMode } from "@/lib/recent-quiz-history";
import {
  buildMyQuizzesRandomApiSearchParams,
  type MyQuizzesRandomContext,
  type MyQuizzesRandomFilters,
} from "@/lib/my-quizzes-random";

export async function selectMyQuizzesRandomQuizId(params: {
  filters: MyQuizzesRandomFilters;
  currentQuizId?: string | null;
}): Promise<string> {
  const searchParams = buildMyQuizzesRandomApiSearchParams(
    params.filters,
    params.currentQuizId,
  );
  const response = await fetch(`/api/dashboard/quizzes/random?${searchParams.toString()}`, {
    cache: "no-store",
  });
  const payload = (await response.json()) as { quizId?: string; error?: string };

  if (!response.ok || !payload.quizId) {
    throw new Error(payload.error ?? "Could not start a random quiz.");
  }

  return payload.quizId;
}

export async function getNextQuizIdForPlayback(params: {
  mode: RecentQuizMode;
  currentQuizId: string;
  playContext?: MyQuizzesRandomContext | null;
}): Promise<string | null> {
  if (params.playContext) {
    return selectMyQuizzesRandomQuizId({
      filters: params.playContext.filters,
      currentQuizId: params.currentQuizId,
    });
  }

  return getNextRecommendedQuizId({
    mode: params.mode,
    currentQuizId: params.currentQuizId,
  });
}
