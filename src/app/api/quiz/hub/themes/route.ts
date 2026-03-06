import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { quizGameModeEnum, quizzes } from "@/db/schema";
import { db } from "@/db";

const validModes = new Set(quizGameModeEnum.enumValues);

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode")?.trim();
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 12), 24);

  const filters = [eq(quizzes.isHub, true)];

  if (mode && validModes.has(mode as (typeof quizGameModeEnum.enumValues)[number])) {
    filters.push(eq(quizzes.gameMode, mode as (typeof quizGameModeEnum.enumValues)[number]));
  }

  const rows = await db
    .select({
      theme: quizzes.theme,
      totalPlayCount: sql<number>`sum(${quizzes.playCount})::int`,
      quizCount: sql<number>`count(*)::int`,
    })
    .from(quizzes)
    .where(and(...filters))
    .groupBy(quizzes.theme)
    .orderBy(sql`sum(${quizzes.playCount}) desc, count(*) desc, ${quizzes.theme} asc`)
    .limit(limit);

  const themes = rows
    .map((row) => ({
      theme: row.theme.trim(),
      totalPlayCount: Number(row.totalPlayCount ?? 0),
      quizCount: Number(row.quizCount ?? 0),
    }))
    .filter((entry) => entry.theme.length > 0);

  return NextResponse.json({ themes });
}

