import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { credits, quizSessions, quizzes } from "@/db/schema";

export type DashboardOverviewData = {
  totalQuizzes: number;
  totalGames: number;
  avgScore: number;
  creditTotalCents: number;
  recentQuizzes: Array<{
    id: string;
    title: string;
    theme: string;
    difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
    gameMode: "single" | "wwtbam" | "couch_coop";
    questionCount: number;
    playCount: number;
    likes: number;
    dislikes: number;
  }>;
  recentGames: Array<{
    id: string;
    totalScore: number;
    startedAt: Date;
    finishedAt: Date | null;
    quizId: string;
    quizTitle: string;
  }>;
};

export async function getDashboardOverviewData(userId: string): Promise<DashboardOverviewData> {
  const [quizStats, sessionStats, creditBalance, recentQuizzes, recentGames] = await Promise.all([
    db
      .select({
        totalQuizzes: sql<number>`count(*)::int`,
      })
      .from(quizzes)
      .where(and(eq(quizzes.creatorId, userId), eq(quizzes.isHub, false))),
    db
      .select({
        totalGames: sql<number>`count(*)::int`,
        avgScore: sql<number>`coalesce(avg(${quizSessions.totalScore})::float, 0)`,
      })
      .from(quizSessions)
      .where(eq(quizSessions.userId, userId)),
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, userId))
      .limit(1),
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
      })
      .from(quizzes)
      .where(and(eq(quizzes.creatorId, userId), eq(quizzes.isHub, false)))
      .orderBy(desc(quizzes.createdAt))
      .limit(5),
    db
      .select({
        id: quizSessions.id,
        totalScore: quizSessions.totalScore,
        startedAt: quizSessions.startedAt,
        finishedAt: quizSessions.finishedAt,
        quizId: quizzes.id,
        quizTitle: quizzes.title,
      })
      .from(quizSessions)
      .innerJoin(quizzes, eq(quizSessions.quizId, quizzes.id))
      .where(eq(quizSessions.userId, userId))
      .orderBy(desc(quizSessions.startedAt))
      .limit(5),
  ]);

  return {
    totalQuizzes: Number(quizStats[0]?.totalQuizzes ?? 0),
    totalGames: Number(sessionStats[0]?.totalGames ?? 0),
    avgScore: Number(sessionStats[0]?.avgScore ?? 0),
    creditTotalCents: Number(creditBalance[0]?.balanceCents ?? 0),
    recentQuizzes,
    recentGames: recentGames.map((game) => ({
      ...game,
      finishedAt: game.finishedAt ?? null,
    })),
  };
}
