import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  quizGameModeEnum,
  quizGenerationJobs,
  quizzes,
} from "@/db/schema";
import { db } from "@/db";
import { getUserSessionOrNull } from "@/lib/user-auth";

type QuizSort = "newest" | "most_played";
type QuizStatusFilter = "all" | "ready" | "generating" | "failed";
type GameModeFilter = "all" | (typeof quizGameModeEnum.enumValues)[number];

export const runtime = "nodejs";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeSort(value: string | null): QuizSort {
  return value === "most_played" ? "most_played" : "newest";
}

function normalizeStatus(value: string | null): QuizStatusFilter {
  if (value === "ready" || value === "generating" || value === "failed") return value;
  return "all";
}

function normalizeGameMode(value: string | null): GameModeFilter {
  if (value === "single" || value === "wwtbam" || value === "couch_coop") return value;
  return "all";
}

function parseJobInputData(inputData: unknown): {
  theme: string;
  gameMode: (typeof quizGameModeEnum.enumValues)[number];
  difficulty: string;
} {
  if (!inputData || typeof inputData !== "object") {
    return {
      theme: "Unknown",
      gameMode: "single",
      difficulty: "mixed",
    };
  }

  const payload = inputData as {
    theme?: unknown;
    displayTheme?: unknown;
    gameMode?: unknown;
    difficulty?: unknown;
  };

  const gameMode =
    payload.gameMode === "single" || payload.gameMode === "wwtbam" || payload.gameMode === "couch_coop"
      ? payload.gameMode
      : "single";

  return {
    theme:
      typeof payload.displayTheme === "string"
        ? payload.displayTheme
        : typeof payload.theme === "string"
          ? payload.theme
          : "Unknown",
    gameMode,
    difficulty: typeof payload.difficulty === "string" ? payload.difficulty : "mixed",
  };
}

export async function GET(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 20), 50);
  const sort = normalizeSort(searchParams.get("sort"));
  const status = normalizeStatus(searchParams.get("status"));
  const mode = normalizeGameMode(searchParams.get("gameMode"));

  const offset = (page - 1) * limit;
  const quizFilters = [eq(quizzes.creatorId, session.user.id), eq(quizzes.isHub, false)];
  if (mode !== "all") {
    quizFilters.push(eq(quizzes.gameMode, mode));
  }

  const shouldIncludeReady = status === "all" || status === "ready";
  const [quizCountRows, quizRows] = shouldIncludeReady
    ? await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
          })
          .from(quizzes)
          .where(and(...quizFilters)),
        db
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
          })
          .from(quizzes)
          .where(and(...quizFilters))
          .orderBy(
            sort === "most_played" ? desc(quizzes.playCount) : desc(quizzes.createdAt),
            desc(quizzes.createdAt),
          )
          .limit(limit)
          .offset(offset),
      ])
    : [[{ total: 0 }], []];

  const shouldIncludeJobs = status === "all" || status === "generating" || status === "failed";
  const jobRows = shouldIncludeJobs
    ? await db
        .select({
          id: quizGenerationJobs.id,
          status: quizGenerationJobs.status,
          inputData: quizGenerationJobs.inputData,
          errorMessage: quizGenerationJobs.errorMessage,
          createdAt: quizGenerationJobs.createdAt,
        })
        .from(quizGenerationJobs)
        .where(
          and(
            eq(quizGenerationJobs.userId, session.user.id),
            isNull(quizGenerationJobs.dismissedAt),
            isNull(quizGenerationJobs.quizId),
          ),
        )
        .orderBy(desc(quizGenerationJobs.createdAt))
        .limit(40)
    : [];

  const filteredJobs = jobRows
    .map((row) => {
      const details = parseJobInputData(row.inputData);
      return {
        id: row.id,
        status: row.status,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        ...details,
      };
    })
    .filter((job) => {
      if (mode !== "all" && job.gameMode !== mode) return false;
      if (status === "generating") {
        return job.status === "pending" || job.status === "processing";
      }
      if (status === "failed") {
        return job.status === "failed";
      }
      return (
        job.status === "pending" ||
        job.status === "processing" ||
        job.status === "failed"
      );
    });

  const quizzesPayload = quizRows.map((quiz) => {
    const totalVotes = quiz.likes + quiz.dislikes;
    return {
      ...quiz,
      status: "ready" as const,
      likeRatio: totalVotes > 0 ? quiz.likes / totalVotes : null,
    };
  });

  const quizTotal = Number(quizCountRows[0]?.total ?? 0);
  const total = quizTotal + filteredJobs.length;

  return NextResponse.json({
    quizzes: quizzesPayload,
    jobs: filteredJobs,
    page,
    limit,
    total,
    hasMore: page * limit < quizTotal,
  });
}
