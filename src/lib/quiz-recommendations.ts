import type { quizDifficultyEnum } from "@/db/schema";

export type RecommendationCandidate = {
  id: string;
  theme: string;
  language: string;
  difficulty: (typeof quizDifficultyEnum.enumValues)[number];
  playCount: number;
  likes: number;
  dislikes: number;
  creatorId: string | null;
};

export type RecommendationContext = {
  currentQuizId: string | null;
  currentTheme: string | null;
  currentLanguage: string | null;
  currentDifficulty: (typeof quizDifficultyEnum.enumValues)[number] | null;
  currentCreatorId: string | null;
};

export type UserRecommendationProfile = {
  averageModeScore: number | null;
  themeAffinity: Map<string, number>;
  creatorAffinity: Map<string, number>;
};

function normalizeThemeKey(theme: string | null | undefined): string | null {
  const normalized = theme?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function computeLikeRatio(candidate: RecommendationCandidate) {
  const totalVotes = candidate.likes + candidate.dislikes;
  if (totalVotes <= 0) {
    return 0.5;
  }

  return candidate.likes / totalVotes;
}

function computeQualityScore(candidate: RecommendationCandidate) {
  const likeRatio = computeLikeRatio(candidate);
  const voteBalance = candidate.likes - candidate.dislikes;
  const popularityScore = Math.log1p(Math.max(candidate.playCount, 0));
  const voteBalanceScore = Math.max(-3, Math.min(3, voteBalance / 10));

  return popularityScore * 0.75 + likeRatio * 2.5 + voteBalanceScore;
}

function computeDifficultyFitScore(
  candidateDifficulty: RecommendationCandidate["difficulty"],
  averageModeScore: number | null,
) {
  if (averageModeScore == null) {
    return 0;
  }

  if (averageModeScore >= 82) {
    if (candidateDifficulty === "hard" || candidateDifficulty === "escalating") return 1.6;
    if (candidateDifficulty === "medium" || candidateDifficulty === "mixed") return 0.8;
    return -0.5;
  }

  if (averageModeScore <= 58) {
    if (candidateDifficulty === "easy") return 1.6;
    if (candidateDifficulty === "medium" || candidateDifficulty === "mixed") return 0.75;
    return -0.8;
  }

  if (candidateDifficulty === "medium" || candidateDifficulty === "mixed") return 1.3;
  if (candidateDifficulty === "hard" || candidateDifficulty === "escalating") return 0.35;
  return 0.15;
}

function computeAnonymousScore(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
) {
  let score = computeQualityScore(candidate);

  if (context.currentTheme && normalizeThemeKey(candidate.theme) === normalizeThemeKey(context.currentTheme)) {
    score += 1.5;
  }

  if (context.currentLanguage && candidate.language === context.currentLanguage) {
    score += 1;
  }

  if (context.currentDifficulty && candidate.difficulty === context.currentDifficulty) {
    score += 0.75;
  }

  if (context.currentCreatorId && candidate.creatorId === context.currentCreatorId) {
    score -= 0.35;
  }

  return score;
}

function computeAuthenticatedScore(
  candidate: RecommendationCandidate,
  context: RecommendationContext,
  profile: UserRecommendationProfile,
) {
  let score = computeAnonymousScore(candidate, context);

  const themeKey = normalizeThemeKey(candidate.theme);
  if (themeKey) {
    score += profile.themeAffinity.get(themeKey) ?? 0;
  }

  if (candidate.creatorId) {
    score += profile.creatorAffinity.get(candidate.creatorId) ?? 0;
  }

  score += computeDifficultyFitScore(candidate.difficulty, profile.averageModeScore);

  return score;
}

function pickWeightedIndex(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return 0;
  }

  let cursor = Math.random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index] ?? 0;
    if (cursor <= 0) {
      return index;
    }
  }

  return Math.max(weights.length - 1, 0);
}

export function chooseRecommendedCandidate(params: {
  candidates: RecommendationCandidate[];
  context: RecommendationContext;
  userProfile?: UserRecommendationProfile | null;
}) {
  const { candidates, context, userProfile } = params;
  if (candidates.length === 0) {
    return null;
  }

  const scoredCandidates = candidates
    .map((candidate) => ({
      candidate,
      score: userProfile
        ? computeAuthenticatedScore(candidate, context, userProfile)
        : computeAnonymousScore(candidate, context),
    }))
    .sort((left, right) => right.score - left.score);

  const finalists = scoredCandidates.slice(0, Math.min(scoredCandidates.length, 6));
  const minScore = finalists.reduce(
    (lowest, entry) => Math.min(lowest, entry.score),
    finalists[0]?.score ?? 0,
  );
  const weights = finalists.map((entry) => Math.max(entry.score - minScore + 1, 0.25));
  const winnerIndex = pickWeightedIndex(weights);

  return finalists[winnerIndex]?.candidate ?? finalists[0]?.candidate ?? null;
}

export function buildUserRecommendationProfile(params: {
  recentSessions: Array<{
    quizId: string;
    theme: string;
    creatorId: string | null;
    normalizedScore: number;
  }>;
  votes: Array<{
    theme: string;
    creatorId: string | null;
    vote: "like" | "dislike";
  }>;
}) {
  const themeAffinity = new Map<string, number>();
  const creatorAffinity = new Map<string, number>();

  for (const session of params.recentSessions) {
    const themeKey = normalizeThemeKey(session.theme);
    if (themeKey) {
      themeAffinity.set(themeKey, (themeAffinity.get(themeKey) ?? 0) + 0.35);
    }
  }

  for (const vote of params.votes) {
    const delta = vote.vote === "like" ? 2.4 : -3;
    const themeKey = normalizeThemeKey(vote.theme);
    if (themeKey) {
      themeAffinity.set(themeKey, (themeAffinity.get(themeKey) ?? 0) + delta);
    }

    if (vote.creatorId) {
      creatorAffinity.set(
        vote.creatorId,
        (creatorAffinity.get(vote.creatorId) ?? 0) + (vote.vote === "like" ? 0.75 : -1.2),
      );
    }
  }

  const averageModeScore =
    params.recentSessions.length > 0
      ? params.recentSessions.reduce((sum, session) => sum + session.normalizedScore, 0) /
        params.recentSessions.length
      : null;

  return {
    averageModeScore,
    themeAffinity,
    creatorAffinity,
  } satisfies UserRecommendationProfile;
}
