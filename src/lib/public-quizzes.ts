import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { hubCandidates, quizzes, user } from "@/db/schema";

export type PublicQuizCard = {
  id: string;
  title: string;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  generationProvider: "openai" | "anthropic" | "google" | null;
  questionCount: number;
  playCount: number;
  likes: number;
  dislikes: number;
  likeRatio: number | null;
  creatorName: string | null;
  creatorImage: string | null;
};

export type PublicQuizMetadataSummary = {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  questionCount: number;
  creatorName: string | null;
  updatedAt: Date;
};

function formatModeLabel(mode: PublicQuizCard["gameMode"] | PublicQuizMetadataSummary["gameMode"]) {
  if (mode === "single") return "single-player";
  if (mode === "couch_coop") return "couch co-op";
  return "millionaire-style";
}

async function loadFallbackCreators(quizIds: string[]) {
  if (quizIds.length === 0) {
    return new Map<string, { creatorName: string | null; creatorImage: string | null }>();
  }

  const rows = await db
    .select({
      publishedQuizId: hubCandidates.publishedQuizId,
      creatorName: user.name,
      creatorImage: user.image,
      creatorAvatarUrl: user.avatarUrl,
    })
    .from(hubCandidates)
    .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
    .where(inArray(hubCandidates.publishedQuizId, quizIds));

  return new Map(
    rows.map((row) => [
      row.publishedQuizId,
      {
        creatorName: row.creatorName,
        creatorImage: row.creatorAvatarUrl ?? row.creatorImage ?? null,
      },
    ]),
  );
}

export async function getHubQuizCards(params?: {
  limit?: number;
  mode?: PublicQuizCard["gameMode"];
  themeSearch?: string | null;
  quizIds?: string[];
  sort?: "popular" | "newest";
}) {
  const limit = Math.max(1, Math.min(params?.limit ?? 6, 24));
  const sort = params?.sort ?? "popular";
  const filters = [eq(quizzes.isHub, true)];

  if (params?.mode) {
    filters.push(eq(quizzes.gameMode, params.mode));
  }

  const normalizedThemeSearch = params?.themeSearch?.trim();
  if (normalizedThemeSearch) {
    const pattern = `%${normalizedThemeSearch}%`;
    filters.push(or(ilike(quizzes.title, pattern), ilike(quizzes.theme, pattern))!);
  }

  if (params?.quizIds?.length) {
    filters.push(inArray(quizzes.id, params.quizIds));
  }

  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      difficulty: quizzes.difficulty,
      gameMode: quizzes.gameMode,
      generationProvider: quizzes.generationProvider,
      questionCount: quizzes.questionCount,
      playCount: quizzes.playCount,
      likes: quizzes.likes,
      dislikes: quizzes.dislikes,
      creatorName: user.name,
      creatorImage: user.image,
      creatorAvatarUrl: user.avatarUrl,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(and(...filters))
    .orderBy(
      sort === "popular" ? desc(quizzes.playCount) : desc(quizzes.createdAt),
      asc(quizzes.title),
    )
    .limit(limit);

  const missingCreatorQuizIds = rows
    .filter((quiz) => quiz.creatorName === null)
    .map((quiz) => quiz.id);
  const fallbackCreatorMap = await loadFallbackCreators(missingCreatorQuizIds);

  return rows.map((quiz) => {
    const voteCount = quiz.likes + quiz.dislikes;
    const fallbackCreator = fallbackCreatorMap.get(quiz.id) ?? null;

    return {
      id: quiz.id,
      title: quiz.title,
      theme: quiz.theme,
      difficulty: quiz.difficulty,
      gameMode: quiz.gameMode,
      generationProvider: quiz.generationProvider,
      questionCount: quiz.questionCount,
      playCount: quiz.playCount,
      likes: quiz.likes,
      dislikes: quiz.dislikes,
      likeRatio: voteCount > 0 ? quiz.likes / voteCount : null,
      creatorName: quiz.creatorName ?? fallbackCreator?.creatorName ?? null,
      creatorImage:
        quiz.creatorAvatarUrl ??
        quiz.creatorImage ??
        fallbackCreator?.creatorImage ??
        null,
    } satisfies PublicQuizCard;
  });
}

export async function getPublicQuizMetadataSummary(quizId: string) {
  const [quizRow] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      theme: quizzes.theme,
      difficulty: quizzes.difficulty,
      gameMode: quizzes.gameMode,
      questionCount: quizzes.questionCount,
      isHub: quizzes.isHub,
      updatedAt: quizzes.updatedAt,
      creatorName: user.name,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quizRow) {
    return null;
  }

  let creatorName = quizRow.creatorName;
  if (!creatorName && quizRow.isHub) {
    const fallbackCreatorMap = await loadFallbackCreators([quizRow.id]);
    creatorName = fallbackCreatorMap.get(quizRow.id)?.creatorName ?? null;
  }

  return {
    id: quizRow.id,
    title: quizRow.title,
    description: quizRow.description,
    theme: quizRow.theme,
    difficulty: quizRow.difficulty,
    gameMode: quizRow.gameMode,
    questionCount: quizRow.questionCount,
    creatorName,
    updatedAt: quizRow.updatedAt,
  } satisfies PublicQuizMetadataSummary;
}

export function buildQuizMetadataDescription(quiz: PublicQuizMetadataSummary) {
  if (quiz.description?.trim()) {
    return quiz.description.trim();
  }

  const creatorSuffix = quiz.creatorName ? ` Created by ${quiz.creatorName}.` : "";
  return `${quiz.questionCount}-question ${formatModeLabel(quiz.gameMode)} quiz about ${quiz.theme}.${creatorSuffix} Play it on QuizPlus.`;
}
