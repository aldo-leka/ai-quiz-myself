import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizSessionAnswers, quizSessions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export const runtime = "nodejs";

export async function GET(_: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const [historySession] = await db
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
    .where(and(eq(quizSessions.id, sessionId), eq(quizSessions.userId, session.user.id)))
    .limit(1);

  if (!historySession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const answers = await db
    .select({
      id: quizSessionAnswers.id,
      questionId: quizSessionAnswers.questionId,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
      selectedOptionIndex: quizSessionAnswers.selectedOptionIndex,
      isCorrect: quizSessionAnswers.isCorrect,
      timeTakenMs: quizSessionAnswers.timeTakenMs,
      position: questions.position,
    })
    .from(quizSessionAnswers)
    .innerJoin(questions, eq(quizSessionAnswers.questionId, questions.id))
    .where(eq(quizSessionAnswers.sessionId, historySession.id))
    .orderBy(asc(questions.position));

  return NextResponse.json({
    session: {
      ...historySession,
      durationMs:
        historySession.finishedAt && historySession.startedAt
          ? Math.max(0, historySession.finishedAt.getTime() - historySession.startedAt.getTime())
          : null,
    },
    answers,
  });
}
