"use client";

import { getNextRecommendedQuizId, type RecentQuizMode } from "@/lib/recent-quiz-history";
import {
  MY_QUIZZES_RANDOM_SOURCE,
  buildMyQuizzesRandomApiSearchParams,
  normalizeMyQuizzesRandomGameMode,
  normalizeMyQuizzesRandomLanguage,
  type MyQuizzesRandomContext,
  type MyQuizzesRandomFilters,
} from "@/lib/my-quizzes-random";

const ACTIVE_MY_QUIZZES_RANDOM_CONTEXT_STORAGE_KEY = "quizplus:active-play-context:v1";

type StoredMyQuizzesRandomContext = MyQuizzesRandomContext & {
  currentQuizId: string;
  quizIds: string[];
};

function readStoredMyQuizzesRandomContext(): StoredMyQuizzesRandomContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      ACTIVE_MY_QUIZZES_RANDOM_CONTEXT_STORAGE_KEY,
    );
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      source?: unknown;
      quizId?: unknown;
      currentQuizId?: unknown;
      quizIds?: unknown;
      filters?: {
        gameMode?: unknown;
        language?: unknown;
      };
    };

    const parsedQuizIds = Array.isArray(parsed.quizIds)
      ? parsed.quizIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : [];
    const currentQuizId =
      typeof parsed.currentQuizId === "string" && parsed.currentQuizId.length > 0
        ? parsed.currentQuizId
        : typeof parsed.quizId === "string" && parsed.quizId.length > 0
          ? parsed.quizId
          : null;
    const quizIds =
      parsedQuizIds.length > 0
        ? Array.from(new Set(parsedQuizIds))
        : currentQuizId
          ? [currentQuizId]
          : [];

    if (
      parsed.source !== MY_QUIZZES_RANDOM_SOURCE ||
      !currentQuizId ||
      quizIds.length === 0
    ) {
      return null;
    }

    return {
      source: MY_QUIZZES_RANDOM_SOURCE,
      currentQuizId,
      quizIds,
      filters: {
        gameMode: normalizeMyQuizzesRandomGameMode(
          typeof parsed.filters?.gameMode === "string" ? parsed.filters.gameMode : null,
        ),
        language: normalizeMyQuizzesRandomLanguage(
          typeof parsed.filters?.language === "string" ? parsed.filters.language : null,
        ),
      },
    };
  } catch {
    return null;
  }
}

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

export function setMyQuizzesRandomPlaybackContext(params: {
  quizId: string;
  playContext?: MyQuizzesRandomContext | null;
}) {
  if (typeof window === "undefined") {
    return;
  }

  if (
    !params.playContext ||
    params.playContext.source !== MY_QUIZZES_RANDOM_SOURCE ||
    !params.quizId
  ) {
    clearMyQuizzesRandomPlaybackContext();
    return;
  }

  const previousContext = readStoredMyQuizzesRandomContext();
  const shouldReuseHistory =
    previousContext?.source === MY_QUIZZES_RANDOM_SOURCE &&
    previousContext.filters.gameMode ===
      normalizeMyQuizzesRandomGameMode(params.playContext.filters.gameMode) &&
    previousContext.filters.language ===
      normalizeMyQuizzesRandomLanguage(params.playContext.filters.language);
  const quizIds = shouldReuseHistory
    ? Array.from(new Set([...previousContext.quizIds, params.quizId]))
    : [params.quizId];

  const payload: StoredMyQuizzesRandomContext = {
    source: MY_QUIZZES_RANDOM_SOURCE,
    currentQuizId: params.quizId,
    quizIds,
    filters: {
      gameMode: normalizeMyQuizzesRandomGameMode(params.playContext.filters.gameMode),
      language: normalizeMyQuizzesRandomLanguage(params.playContext.filters.language),
    },
  };

  try {
    window.sessionStorage.setItem(
      ACTIVE_MY_QUIZZES_RANDOM_CONTEXT_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage write failures and keep playback working without persistence.
  }
}

export function getMyQuizzesRandomPlaybackContextForQuiz(
  quizId: string | null | undefined,
): MyQuizzesRandomContext | null {
  if (!quizId) {
    return null;
  }

  const storedContext = readStoredMyQuizzesRandomContext();
  if (!storedContext) {
    clearMyQuizzesRandomPlaybackContext();
    return null;
  }

  if (
    storedContext.currentQuizId !== quizId &&
    !storedContext.quizIds.includes(quizId)
  ) {
    clearMyQuizzesRandomPlaybackContext();
    return null;
  }

  return {
    source: storedContext.source,
    filters: storedContext.filters,
  };
}

export function clearMyQuizzesRandomPlaybackContext() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ACTIVE_MY_QUIZZES_RANDOM_CONTEXT_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
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
