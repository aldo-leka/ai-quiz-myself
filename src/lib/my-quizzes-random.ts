export const MY_QUIZZES_RANDOM_SOURCE = "my-quizzes-random";
export const MY_QUIZZES_RANDOM_GAME_MODES = [
  "single",
  "wwtbam",
  "couch_coop",
] as const;

export type MyQuizzesRandomGameModeFilter =
  | "all"
  | (typeof MY_QUIZZES_RANDOM_GAME_MODES)[number];
export type MyQuizzesRandomLanguageFilter = "all" | string;

export type MyQuizzesRandomFilters = {
  gameMode: MyQuizzesRandomGameModeFilter;
  language: MyQuizzesRandomLanguageFilter;
};

export type MyQuizzesRandomContext = {
  source: typeof MY_QUIZZES_RANDOM_SOURCE;
  filters: MyQuizzesRandomFilters;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

export function normalizeMyQuizzesRandomGameMode(
  value: string | null | undefined,
): MyQuizzesRandomGameModeFilter {
  if (
    value === "single" ||
    value === "wwtbam" ||
    value === "couch_coop"
  ) {
    return value;
  }

  return "all";
}

export function normalizeMyQuizzesRandomLanguage(
  value: string | null | undefined,
): MyQuizzesRandomLanguageFilter {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : "all";
}

export function buildMyQuizzesRandomApiSearchParams(
  filters: MyQuizzesRandomFilters,
  currentQuizId?: string | null,
) {
  const searchParams = new URLSearchParams({
    gameMode: filters.gameMode,
    language: filters.language,
  });

  if (currentQuizId) {
    searchParams.set("currentQuizId", currentQuizId);
  }

  return searchParams;
}

export function buildQuizPlayPath(params: {
  quizId: string;
  playContext?: MyQuizzesRandomContext | null;
  retryToken?: string | number | null;
}) {
  const searchParams = new URLSearchParams();

  if (params.playContext?.source === MY_QUIZZES_RANDOM_SOURCE) {
    searchParams.set("playSource", MY_QUIZZES_RANDOM_SOURCE);
    searchParams.set("randomGameMode", params.playContext.filters.gameMode);
    searchParams.set("randomLanguage", params.playContext.filters.language);
  }

  if (params.retryToken !== undefined && params.retryToken !== null) {
    searchParams.set("retry", String(params.retryToken));
  }

  const query = searchParams.toString();
  return query.length > 0 ? `/play/${params.quizId}?${query}` : `/play/${params.quizId}`;
}

export function parseMyQuizzesRandomContext(
  searchParams: SearchParamsLike | null | undefined,
): MyQuizzesRandomContext | null {
  if (!searchParams) {
    return null;
  }

  const playSource = searchParams.get("playSource");
  if (playSource !== MY_QUIZZES_RANDOM_SOURCE) {
    return null;
  }

  return {
    source: MY_QUIZZES_RANDOM_SOURCE,
    filters: {
      gameMode: normalizeMyQuizzesRandomGameMode(searchParams.get("randomGameMode")),
      language: normalizeMyQuizzesRandomLanguage(searchParams.get("randomLanguage")),
    },
  };
}
