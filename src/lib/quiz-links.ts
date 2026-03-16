export type CreateQuizSourceType = "theme" | "url" | "pdf";
export type CreateQuizMode = "single" | "wwtbam" | "couch_coop";
export type CreateQuizDifficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";

export type CreateQuizPrefill = {
  sourceType?: CreateQuizSourceType;
  theme?: string | null;
  url?: string | null;
  mode?: CreateQuizMode;
  difficulty?: CreateQuizDifficulty;
};

function setOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | null | undefined,
) {
  const normalized = value?.trim();
  if (normalized) {
    params.set(key, normalized);
  }
}

export function buildCreateQuizPath(prefill: CreateQuizPrefill = {}) {
  const params = new URLSearchParams();

  if (prefill.sourceType) {
    params.set("sourceType", prefill.sourceType);
  }

  if (prefill.mode) {
    params.set("mode", prefill.mode);
  }

  if (prefill.difficulty) {
    params.set("difficulty", prefill.difficulty);
  }

  setOptionalParam(params, "theme", prefill.theme);
  setOptionalParam(params, "url", prefill.url);

  const query = params.toString();
  return query ? `/dashboard/create?${query}` : "/dashboard/create";
}

export function buildCreateQuizSignInPath(prefill: CreateQuizPrefill = {}) {
  const callbackURL = buildCreateQuizPath(prefill);
  return `/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export function buildPublicQuizPath(quizId: string) {
  return `/play/${quizId}`;
}

export function computeIncludedQuizCount(
  starterCreditsCents: number,
  generationCostCents: number,
) {
  if (generationCostCents <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(starterCreditsCents / generationCostCents));
}
