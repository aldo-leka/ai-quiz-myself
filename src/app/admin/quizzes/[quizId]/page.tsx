import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { AdminQuizDetailClient } from "@/components/admin/admin-quiz-detail-client";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";

type PageProps = {
  params: Promise<{ quizId: string }>;
};

function normalizeOptions(
  value: unknown,
): Array<{
  text: string;
  explanation: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const option = item as { text?: unknown; explanation?: unknown };
      return {
        text: typeof option.text === "string" ? option.text : "",
        explanation: typeof option.explanation === "string" ? option.explanation : "",
      };
    })
    .filter((item): item is { text: string; explanation: string } => item !== null);
}

export default async function AdminQuizDetailPage({ params }: PageProps) {
  const { quizId } = await params;

  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      gameMode: quizzes.gameMode,
      sourceType: quizzes.sourceType,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz) {
    notFound();
  }

  const quizQuestions = await db
    .select({
      id: questions.id,
      quizId: questions.quizId,
      position: questions.position,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
      difficulty: questions.difficulty,
      subject: questions.subject,
    })
    .from(questions)
    .where(eq(questions.quizId, quizId))
    .orderBy(asc(questions.position));

  return (
    <AdminQuizDetailClient
      quizId={quiz.id}
      title={quiz.title}
      theme={quiz.theme}
      gameMode={quiz.gameMode}
      sourceType={quiz.sourceType}
      questions={quizQuestions.map((question) => ({
        ...question,
        options: normalizeOptions(question.options),
      }))}
    />
  );
}
