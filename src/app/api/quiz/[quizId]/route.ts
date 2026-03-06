import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { hubCandidates, questions, quizzes, user } from "@/db/schema";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

function normalizeOptions(
  options: unknown,
): Array<{ text: string; explanation: string }> {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const text = "text" in option && typeof option.text === "string" ? option.text : null;
      const explanation =
        "explanation" in option && typeof option.explanation === "string"
          ? option.explanation
          : "";

      if (!text) return null;
      return { text, explanation };
    })
    .filter((option): option is { text: string; explanation: string } => option !== null);
}

function shuffleQuestionOptions(
  options: Array<{ text: string; explanation: string }>,
  correctOptionIndex: number,
) {
  const shuffled = options.map((option, index) => ({
    option,
    originalIndex: index,
  }));

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }

  const remappedCorrectIndex = shuffled.findIndex(
    (entry) => entry.originalIndex === correctOptionIndex,
  );

  return {
    options: shuffled.map((entry) => entry.option),
    correctOptionIndex: remappedCorrectIndex >= 0 ? remappedCorrectIndex : correctOptionIndex,
  };
}

export async function GET(_: Request, { params }: RouteContext) {
  const { quizId } = await params;

  const [quizRow] = await db
    .select({
      quiz: quizzes,
      creatorName: user.name,
      creatorImage: user.image,
      creatorAvatarUrl: user.avatarUrl,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quizRow) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  let creatorName = quizRow.creatorName;
  let creatorImage = quizRow.creatorAvatarUrl ?? quizRow.creatorImage ?? null;

  if (!creatorName && quizRow.quiz.isHub) {
    const [fallbackCreator] = await db
      .select({
        creatorName: user.name,
        creatorImage: user.image,
        creatorAvatarUrl: user.avatarUrl,
      })
      .from(hubCandidates)
      .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
      .where(eq(hubCandidates.publishedQuizId, quizRow.quiz.id))
      .limit(1);

    creatorName = fallbackCreator?.creatorName ?? null;
    creatorImage =
      fallbackCreator?.creatorAvatarUrl ??
      fallbackCreator?.creatorImage ??
      creatorImage;
  }

  const rawQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quizRow.quiz.id))
    .orderBy(asc(questions.position));

  const normalizedQuestions = rawQuestions.map((question) => {
    const options = normalizeOptions(question.options);
    const shuffled = shuffleQuestionOptions(options, question.correctOptionIndex);

    return {
      ...question,
      options: shuffled.options,
      correctOptionIndex: shuffled.correctOptionIndex,
    };
  });

  return NextResponse.json({
    quiz: {
      ...quizRow.quiz,
      creatorName,
      creatorImage,
      questions: normalizedQuestions,
    },
  });
}
