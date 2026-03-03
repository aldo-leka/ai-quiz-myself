import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
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
      gameMode: quizzes.gameMode,
      difficulty: quizzes.difficulty,
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
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-100">{quiz.title}</h2>
            <p className="mt-2 text-slate-300">
              Theme: {quiz.theme} · Mode: {quiz.gameMode} · Difficulty: {quiz.difficulty}
            </p>
          </div>
          <Button asChild variant="outline" className="border-cyan-500/50 text-cyan-100">
            <Link href="/dashboard/my-quizzes">Back to My Quizzes</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        {quizQuestions.map((question) => {
          const options = parseOptions(question.options);
          return (
            <article
              key={question.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
            >
              <p className="text-sm text-slate-400">
                Question {question.position} · {question.difficulty}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">{question.questionText}</h3>
              {question.subject ? <p className="mt-1 text-sm text-slate-400">Subject: {question.subject}</p> : null}
              <ul className="mt-4 space-y-2">
                {options.map((option, index) => (
                  <li
                    key={`${question.id}-${index}`}
                    className={`rounded-lg border p-3 ${
                      index === question.correctOptionIndex
                        ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                        : "border-slate-700 bg-slate-950/60 text-slate-200"
                    }`}
                  >
                    <p className="font-medium">{option.text}</p>
                    <p className="mt-1 text-sm opacity-90">{option.explanation}</p>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
