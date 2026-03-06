import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { DashboardQuizDetailClient } from "@/components/dashboard/dashboard-quiz-detail-client";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type PageProps = {
  params: Promise<{ quizId: string }>;
};

function parseOptions(value: unknown): Array<{ text: string; explanation: string }> {
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
    .filter((option): option is { text: string; explanation: string } => option !== null);
}

export default async function DashboardMyQuizDetailPage({ params }: PageProps) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    notFound();
  }

  const { quizId } = await params;

  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      language: quizzes.language,
      gameMode: quizzes.gameMode,
      difficulty: quizzes.difficulty,
      isHub: quizzes.isHub,
      hubStatus: quizzes.hubStatus,
      isFlagged: quizzes.isFlagged,
      flagReason: quizzes.flagReason,
    })
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.creatorId, session.user.id)))
    .limit(1);

  if (!quiz) {
    notFound();
  }

  const quizQuestions = await db
    .select({
      id: questions.id,
      position: questions.position,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
      difficulty: questions.difficulty,
      subject: questions.subject,
    })
    .from(questions)
    .where(eq(questions.quizId, quiz.id))
    .orderBy(asc(questions.position));

  return (
    <DashboardQuizDetailClient
      quizId={quiz.id}
      title={quiz.title}
      theme={quiz.theme}
      language={quiz.language}
      gameMode={quiz.gameMode}
      difficulty={quiz.difficulty}
      isHub={quiz.isHub}
      hubStatus={quiz.hubStatus}
      isFlagged={quiz.isFlagged}
      flagReason={quiz.flagReason}
      questions={quizQuestions.map((question) => ({
        ...question,
        options: parseOptions(question.options),
      }))}
    />
  );
}
