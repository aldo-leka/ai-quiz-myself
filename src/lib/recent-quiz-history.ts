"use client";

export type RecentQuizMode = "single" | "wwtbam" | "couch_coop";

const STORAGE_KEY = "quizplus:recent-served-quizzes:v1";
const MAX_RECENT_QUIZZES_PER_MODE = 50;

type RecentQuizHistory = Record<RecentQuizMode, string[]>;

const EMPTY_HISTORY: RecentQuizHistory = {
  single: [],
  wwtbam: [],
  couch_coop: [],
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecentQuizMode(value: unknown): value is RecentQuizMode {
  return value === "single" || value === "wwtbam" || value === "couch_coop";
}

function normalizeHistory(value: unknown): RecentQuizHistory {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_HISTORY };
  }

  const history = value as Record<string, unknown>;
  const nextHistory: RecentQuizHistory = { ...EMPTY_HISTORY };

  for (const mode of Object.keys(EMPTY_HISTORY) as RecentQuizMode[]) {
    const items = history[mode];
    if (!Array.isArray(items)) {
      continue;
    }

    nextHistory[mode] = items
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(-MAX_RECENT_QUIZZES_PER_MODE);
  }

  return nextHistory;
}

function readHistory(): RecentQuizHistory {
  if (!canUseStorage()) {
    return { ...EMPTY_HISTORY };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...EMPTY_HISTORY };
    }

    return normalizeHistory(JSON.parse(raw));
  } catch {
    return { ...EMPTY_HISTORY };
  }
}

function writeHistory(history: RecentQuizHistory) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function buildRandomQuizSearchParams(mode: RecentQuizMode, excludeIds: string[]) {
  const params = new URLSearchParams({ mode });
  if (excludeIds.length > 0) {
    params.set("exclude", excludeIds.join(","));
  }
  return params;
}

export function rememberRecentQuiz(mode: RecentQuizMode, quizId: string) {
  if (!canUseStorage() || !isRecentQuizMode(mode) || quizId.trim().length === 0) {
    return;
  }

  const history = readHistory();
  history[mode] = [...history[mode].filter((id) => id !== quizId), quizId].slice(
    -MAX_RECENT_QUIZZES_PER_MODE,
  );
  writeHistory(history);
}

export function getRecentQuizIds(mode: RecentQuizMode): string[] {
  if (!isRecentQuizMode(mode)) {
    return [];
  }

  return readHistory()[mode];
}

export async function getNextRandomQuizId(params: {
  mode: RecentQuizMode;
  currentQuizId: string;
}): Promise<string | null> {
  const recentIds = getRecentQuizIds(params.mode);
  const primaryExcludeIds = Array.from(new Set([...recentIds, params.currentQuizId]));

  const primaryResponse = await fetch(
    `/api/quiz/random?${buildRandomQuizSearchParams(params.mode, primaryExcludeIds).toString()}`,
    { cache: "no-store" },
  );

  if (primaryResponse.ok) {
    const payload = (await primaryResponse.json()) as { quiz: { id: string } };
    return payload.quiz.id;
  }

  const fallbackExcludeIds = params.currentQuizId ? [params.currentQuizId] : [];
  const fallbackResponse = await fetch(
    `/api/quiz/random?${buildRandomQuizSearchParams(params.mode, fallbackExcludeIds).toString()}`,
    { cache: "no-store" },
  );

  if (!fallbackResponse.ok) {
    return null;
  }

  const payload = (await fallbackResponse.json()) as { quiz: { id: string } };
  return payload.quiz.id;
}
