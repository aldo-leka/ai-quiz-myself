import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizGameModeEnum, quizSessions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type HistorySort = "date" | "score";
type GameModeFilter = "all" | (typeof quizGameModeEnum.enumValues)[number];

export const runtime = "nodejs";

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeSort(value: string | null): HistorySort {
  return value === "score" ? "score" : "date";
}

function normalizeMode(value: string | null): GameModeFilter {
  if (value === "single" || value === "wwtbam" || value === "couch_coop") return value;
  return "all";
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
  const mode = normalizeMode(searchParams.get("gameMode"));

  const offset = (page - 1) * limit;
  const filters = [eq(quizSessions.userId, session.user.id)];
  if (mode !== "all") {
    filters.push(eq(quizSessions.gameMode, mode));
  }

  const [countRows, rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
      })
      .from(quizSessions)
      .where(and(...filters)),
    db
      .select({
        id: quizSessions.id,
        quizId: quizSessions.quizId,
        quizTitle: quizzes.title,
        gameMode: quizSessions.gameMode,
        totalScore: quizSessions.totalScore,
        startedAt: quizSessions.startedAt,
        finishedAt: quizSessions.finishedAt,
      })
      .from(quizSessions)
      .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
      .where(and(...filters))
      .orderBy(
        sort === "score" ? desc(quizSessions.totalScore) : desc(quizSessions.startedAt),
        desc(quizSessions.startedAt),
      )
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const sessions = rows.map((row) => {
    const durationMs =
      row.finishedAt && row.startedAt
        ? Math.max(0, row.finishedAt.getTime() - row.startedAt.getTime())
        : null;
    return {
      ...row,
      durationMs,
    };
  });

  return NextResponse.json({
    sessions,
    page,
    limit,
    total,
    hasMore: page * limit < total,
  });
}
