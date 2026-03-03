import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

export async function GET() {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const flagged = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      gameMode: quizzes.gameMode,
      sourceType: quizzes.sourceType,
      isHub: quizzes.isHub,
      language: quizzes.language,
      flagReason: quizzes.flagReason,
      creatorId: quizzes.creatorId,
      creatorName: user.name,
      creatorEmail: user.email,
      createdAt: quizzes.createdAt,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(eq(quizzes.isFlagged, true));

  if (flagged.length === 0) {
    return NextResponse.json({ quizzes: [] });
  }

  const quizIds = flagged.map((quiz) => quiz.id);
  const questionRows = await db
    .select({
      quizId: questions.quizId,
      position: questions.position,
      questionText: questions.questionText,
    })
    .from(questions)
    .where(inArray(questions.quizId, quizIds));

  const questionPreviewByQuiz = new Map<string, Array<{ position: number; questionText: string }>>();
  for (const question of questionRows) {
    if (!questionPreviewByQuiz.has(question.quizId)) {
      questionPreviewByQuiz.set(question.quizId, []);
    }
    questionPreviewByQuiz.get(question.quizId)?.push({
      position: question.position,
      questionText: question.questionText,
    });
  }

  const quizzesWithPreview = flagged.map((quiz) => ({
    ...quiz,
    questionPreview: (questionPreviewByQuiz.get(quiz.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .slice(0, 3),
  }));

  return NextResponse.json({ quizzes: quizzesWithPreview });
}

