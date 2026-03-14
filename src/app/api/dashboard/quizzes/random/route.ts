import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  quizzes,
  userQuizRandomHistory,
} from "@/db/schema";
import {
  normalizeMyQuizzesRandomGameMode,
  normalizeMyQuizzesRandomLanguage,
} from "@/lib/my-quizzes-random";
import { getUserSessionOrNull } from "@/lib/user-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  gameMode: z.string().optional(),
  language: z.string().optional(),
  currentQuizId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = querySchema.safeParse({
    gameMode: searchParams.get("gameMode") ?? undefined,
    language: searchParams.get("language") ?? undefined,
    currentQuizId: searchParams.get("currentQuizId") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "Invalid query",
        issues: parsedQuery.error.issues,
      },
      { status: 400 },
    );
  }

  const filters = {
    gameMode: normalizeMyQuizzesRandomGameMode(parsedQuery.data.gameMode),
    language: normalizeMyQuizzesRandomLanguage(parsedQuery.data.language),
  };
  const currentQuizId = parsedQuery.data.currentQuizId ?? null;
  const userId = session.user.id;

  const quizFilters = [eq(quizzes.creatorId, userId), eq(quizzes.isHub, false)];
  if (filters.gameMode !== "all") {
    quizFilters.push(eq(quizzes.gameMode, filters.gameMode));
  }
  if (filters.language !== "all") {
    quizFilters.push(eq(quizzes.language, filters.language));
  }

  const historyJoin = and(
    eq(userQuizRandomHistory.userId, userId),
    eq(userQuizRandomHistory.quizId, quizzes.id),
    eq(userQuizRandomHistory.gameModeFilter, filters.gameMode),
    eq(userQuizRandomHistory.languageFilter, filters.language),
  );

  const orderBy = [
    sql`case when ${userQuizRandomHistory.id} is null then 0 else 1 end`,
    sql`coalesce(${userQuizRandomHistory.serveCount}, 0)`,
    sql`${userQuizRandomHistory.lastServedAt} asc nulls first`,
  ];

  if (currentQuizId) {
    orderBy.push(sql`case when ${quizzes.id} = ${currentQuizId} then 1 else 0 end`);
  }

  orderBy.push(sql`random()`);

  const [selectedQuiz] = await db
    .select({
      id: quizzes.id,
    })
    .from(quizzes)
    .leftJoin(userQuizRandomHistory, historyJoin)
    .where(and(...quizFilters))
    .orderBy(...orderBy)
    .limit(1);

  if (!selectedQuiz) {
    return NextResponse.json(
      { error: "No matching ready quizzes found for these filters." },
      { status: 404 },
    );
  }

  const now = new Date();
  await db
    .insert(userQuizRandomHistory)
    .values({
      userId,
      quizId: selectedQuiz.id,
      gameModeFilter: filters.gameMode,
      languageFilter: filters.language,
      serveCount: 1,
      lastServedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        userQuizRandomHistory.userId,
        userQuizRandomHistory.gameModeFilter,
        userQuizRandomHistory.languageFilter,
        userQuizRandomHistory.quizId,
      ],
      set: {
        serveCount: sql`${userQuizRandomHistory.serveCount} + 1`,
        lastServedAt: now,
        updatedAt: now,
      },
    });

  return NextResponse.json(
    {
      quizId: selectedQuiz.id,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
