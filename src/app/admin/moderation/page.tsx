import { eq, inArray } from "drizzle-orm";
import { AdminModerationPageClient } from "@/components/admin/admin-moderation-page-client";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import { user } from "@/db/schema/auth";

export default async function AdminModerationPage() {
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
      creatorName: user.name,
      creatorEmail: user.email,
      createdAt: quizzes.createdAt,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(eq(quizzes.isFlagged, true));

  if (flagged.length === 0) {
    return <AdminModerationPageClient initialQuizzes={[]} />;
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

  const previewByQuizId = new Map<string, Array<{ position: number; questionText: string }>>();
  for (const row of questionRows) {
    if (!previewByQuizId.has(row.quizId)) {
      previewByQuizId.set(row.quizId, []);
    }
    previewByQuizId.get(row.quizId)?.push({
      position: row.position,
      questionText: row.questionText,
    });
  }

  return (
    <AdminModerationPageClient
      initialQuizzes={flagged.map((quiz) => ({
        ...quiz,
        createdAt: quiz.createdAt.toISOString(),
        questionPreview: (previewByQuizId.get(quiz.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .slice(0, 3),
      }))}
    />
  );
}
