import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  hubCandidates,
  quizDifficultyEnum,
  quizGameModeEnum,
  quizzes,
  user,
} from "@/db/schema";
import { db } from "@/db";

type HubSort = "popular" | "newest";

const VALID_DIFFICULTIES = new Set(quizDifficultyEnum.enumValues);
const VALID_GAME_MODES = new Set(quizGameModeEnum.enumValues);
const VALID_SORTS = new Set<HubSort>(["popular", "newest"]);

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const theme = searchParams.get("theme")?.trim();
  const difficulty = searchParams.get("difficulty")?.trim();
  const mode = searchParams.get("mode")?.trim();
  const sortRaw = searchParams.get("sort")?.trim().toLowerCase() as HubSort | undefined;
  const search = searchParams.get("search")?.trim();

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limit = clamp(parsePositiveInt(searchParams.get("limit"), 20), 1, 50);
  const sort: HubSort = sortRaw && VALID_SORTS.has(sortRaw) ? sortRaw : "popular";

  const filters = [eq(quizzes.isHub, true)];

  if (theme) {
    filters.push(eq(quizzes.theme, theme));
  }

  if (difficulty && VALID_DIFFICULTIES.has(difficulty as (typeof quizDifficultyEnum.enumValues)[number])) {
    if (difficulty === "mixed") {
      filters.push(
        or(
          eq(quizzes.difficulty, "mixed"),
          eq(quizzes.difficulty, "escalating"),
        )!,
      );
    } else {
      filters.push(eq(quizzes.difficulty, difficulty as (typeof quizDifficultyEnum.enumValues)[number]));
    }
  }

  if (mode && VALID_GAME_MODES.has(mode as (typeof quizGameModeEnum.enumValues)[number])) {
    filters.push(eq(quizzes.gameMode, mode as (typeof quizGameModeEnum.enumValues)[number]));
  }

  if (search) {
    const pattern = `%${search}%`;
    filters.push(or(ilike(quizzes.title, pattern), ilike(quizzes.theme, pattern))!);
  }

  const whereClause = and(...filters);
  const offset = (page - 1) * limit;

  const [countRow] = await db
    .select({ total: count() })
    .from(quizzes)
    .where(whereClause);

  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      difficulty: quizzes.difficulty,
      gameMode: quizzes.gameMode,
      questionCount: quizzes.questionCount,
      playCount: quizzes.playCount,
      likes: quizzes.likes,
      dislikes: quizzes.dislikes,
      createdAt: quizzes.createdAt,
      creatorName: user.name,
      creatorImage: user.image,
      creatorAvatarUrl: user.avatarUrl,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(whereClause)
    .orderBy(
      sort === "popular" ? desc(quizzes.playCount) : desc(quizzes.createdAt),
      asc(quizzes.title),
    )
    .limit(limit)
    .offset(offset);

  const missingCreatorQuizIds = rows
    .filter((quiz) => quiz.creatorName === null)
    .map((quiz) => quiz.id);

  const fallbackCreators = missingCreatorQuizIds.length
    ? await db
        .select({
          publishedQuizId: hubCandidates.publishedQuizId,
          creatorName: user.name,
          creatorImage: user.image,
          creatorAvatarUrl: user.avatarUrl,
        })
        .from(hubCandidates)
        .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
        .where(inArray(hubCandidates.publishedQuizId, missingCreatorQuizIds))
    : [];

  const fallbackCreatorMap = new Map(
    fallbackCreators.map((row) => [
      row.publishedQuizId,
      {
        creatorName: row.creatorName,
        creatorImage: row.creatorAvatarUrl ?? row.creatorImage,
      },
    ]),
  );

  const hubQuizzes = rows.map((quiz) => {
    const voteCount = quiz.likes + quiz.dislikes;
    const fallbackCreator = fallbackCreatorMap.get(quiz.id) ?? null;
    return {
      id: quiz.id,
      title: quiz.title,
      theme: quiz.theme,
      difficulty: quiz.difficulty,
      gameMode: quiz.gameMode,
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
    };
  });

  return NextResponse.json({
    quizzes: hubQuizzes,
    total,
    page,
    hasMore: page * limit < total,
  });
}
