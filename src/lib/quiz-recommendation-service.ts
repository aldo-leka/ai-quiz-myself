import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { quizSessions, quizzes, quizVotes, type quizGameModeEnum } from "@/db/schema";
import {
  buildUserRecommendationProfile,
  chooseRecommendedCandidate,
  type RecommendationCandidate,
  type RecommendationContext,
} from "@/lib/quiz-recommendations";

const MAX_EXCLUDE_IDS = 80;
const CANDIDATE_POOL_SIZE = 120;
const USER_RECENT_SESSION_LIMIT = 30;
const USER_RECENT_VOTE_LIMIT = 50;

export type RecommendationMode = (typeof quizGameModeEnum.enumValues)[number];

export function parseRecommendationExcludeIds(rawValue: string | undefined) {
  if (!rawValue) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, MAX_EXCLUDE_IDS),
    ),
  );
}

async function getRecommendationContextFromQuiz(
  currentQuizId: string,
): Promise<RecommendationContext | null> {
  const [currentQuiz] = await db
    .select({
      id: quizzes.id,
      theme: quizzes.theme,
      language: quizzes.language,
      difficulty: quizzes.difficulty,
      creatorId: quizzes.creatorId,
    })
    .from(quizzes)
    .where(eq(quizzes.id, currentQuizId))
    .limit(1);

  if (!currentQuiz) {
    return null;
  }

  return {
    currentQuizId: currentQuiz.id,
    currentTheme: currentQuiz.theme,
    currentLanguage: currentQuiz.language,
    currentDifficulty: currentQuiz.difficulty,
    currentCreatorId: currentQuiz.creatorId,
  };
}

async function getUserProfile(userId: string, mode: RecommendationMode) {
  const recentSessions = await db
    .select({
      quizId: quizSessions.quizId,
      theme: quizzes.theme,
      creatorId: quizzes.creatorId,
      normalizedScore: quizSessions.normalizedScore,
    })
    .from(quizSessions)
    .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
    .where(and(eq(quizSessions.userId, userId), eq(quizSessions.gameMode, mode)))
    .orderBy(desc(quizSessions.startedAt))
    .limit(USER_RECENT_SESSION_LIMIT);

  const recentVotes = await db
    .select({
      theme: quizzes.theme,
      creatorId: quizzes.creatorId,
      vote: quizVotes.vote,
    })
    .from(quizVotes)
    .innerJoin(quizzes, eq(quizVotes.quizId, quizzes.id))
    .where(and(eq(quizVotes.userId, userId), eq(quizzes.gameMode, mode), eq(quizzes.isHub, true)))
    .orderBy(desc(quizVotes.updatedAt))
    .limit(USER_RECENT_VOTE_LIMIT);

  return buildUserRecommendationProfile({
    recentSessions,
    votes: recentVotes,
  });
}

async function getCandidatePool(params: {
  mode: RecommendationMode;
  language: string | null;
  theme: string | null;
  excludeIds: string[];
}) {
  const filters = [eq(quizzes.isHub, true), eq(quizzes.gameMode, params.mode)];

  if (params.language) {
    filters.push(eq(quizzes.language, params.language));
  }

  if (params.theme) {
    filters.push(eq(quizzes.theme, params.theme));
  }

  if (params.excludeIds.length > 0) {
    filters.push(notInArray(quizzes.id, params.excludeIds));
  }

  return db
    .select({
      id: quizzes.id,
      theme: quizzes.theme,
      language: quizzes.language,
      difficulty: quizzes.difficulty,
      playCount: quizzes.playCount,
      likes: quizzes.likes,
      dislikes: quizzes.dislikes,
      creatorId: quizzes.creatorId,
    })
    .from(quizzes)
    .where(and(...filters))
    .orderBy(sql`random()`)
    .limit(CANDIDATE_POOL_SIZE) as Promise<RecommendationCandidate[]>;
}

export async function recommendQuizId(params: {
  mode: RecommendationMode;
  userId: string | null;
  currentQuizId?: string | null;
  theme?: string | null;
  excludeIds?: string[];
}) {
  const currentContext = params.currentQuizId
    ? await getRecommendationContextFromQuiz(params.currentQuizId)
    : null;

  if (params.currentQuizId && !currentContext) {
    return null;
  }

  const recommendationContext: RecommendationContext =
    currentContext ?? {
      currentQuizId: null,
      currentTheme: params.theme?.trim() || null,
      currentLanguage: null,
      currentDifficulty: null,
      currentCreatorId: null,
    };

  const userProfile = params.userId ? await getUserProfile(params.userId, params.mode) : null;
  const combinedExcludeIds = Array.from(
    new Set([
      ...(recommendationContext.currentQuizId ? [recommendationContext.currentQuizId] : []),
      ...(params.excludeIds ?? []),
      ...(userProfile?.recentQuizIds ?? []),
    ]),
  ).slice(0, MAX_EXCLUDE_IDS);

  let candidates = await getCandidatePool({
    mode: params.mode,
    language: recommendationContext.currentLanguage,
    theme: params.theme?.trim() || null,
    excludeIds: combinedExcludeIds,
  });

  if (candidates.length === 0 && recommendationContext.currentLanguage) {
    candidates = await getCandidatePool({
      mode: params.mode,
      language: null,
      theme: params.theme?.trim() || null,
      excludeIds: combinedExcludeIds,
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  return chooseRecommendedCandidate({
    candidates,
    context: recommendationContext,
    userProfile,
  });
}
