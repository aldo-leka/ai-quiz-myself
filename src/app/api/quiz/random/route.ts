import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { questions, quizGameModeEnum, quizzes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseRecommendationExcludeIds, recommendQuizId } from "@/lib/quiz-recommendation-service";

const validModes = new Set(quizGameModeEnum.enumValues);

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
  hostHintGuessedOptionIndex: number | null,
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
  const remappedHostHintIndex =
    typeof hostHintGuessedOptionIndex === "number"
      ? shuffled.findIndex((entry) => entry.originalIndex === hostHintGuessedOptionIndex)
      : -1;

  return {
    options: shuffled.map((entry) => entry.option),
    correctOptionIndex: remappedCorrectIndex >= 0 ? remappedCorrectIndex : correctOptionIndex,
    hostHintDisplayedOptionIndex:
      remappedHostHintIndex >= 0 ? remappedHostHintIndex : null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const theme = searchParams.get("theme")?.trim();
  const exclude = parseRecommendationExcludeIds(searchParams.get("exclude") ?? undefined);

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    session = null;
  }

  let quiz = null;

  if (mode && validModes.has(mode as (typeof quizGameModeEnum.enumValues)[number])) {
    quiz =
      (await recommendQuizId({
        mode: mode as (typeof quizGameModeEnum.enumValues)[number],
        userId: session?.user?.id ?? null,
        theme: theme ?? null,
        excludeIds: exclude,
      })) ?? null;
  }

  if (!quiz) {
    const filters = [eq(quizzes.isHub, true)];

    if (mode && validModes.has(mode as (typeof quizGameModeEnum.enumValues)[number])) {
      filters.push(eq(quizzes.gameMode, mode as (typeof quizGameModeEnum.enumValues)[number]));
    }

    if (theme) {
      filters.push(eq(quizzes.theme, theme));
    }

    if (exclude.length > 0) {
      filters.push(notInArray(quizzes.id, exclude));
    }

    const [fallbackQuiz] = await db
      .select()
      .from(quizzes)
      .where(and(...filters))
      .orderBy(sql`random()`)
      .limit(1);
    quiz = fallbackQuiz ?? null;
  }

  if (!quiz) {
    return NextResponse.json({ error: "No matching quiz found" }, { status: 404 });
  }

  const rawQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.quizId, quiz.id))
    .orderBy(asc(questions.position));

  const normalizedQuestions = rawQuestions.map((question) => {
    const options = normalizeOptions(question.options);
    const shuffled = shuffleQuestionOptions(
      options,
      question.correctOptionIndex,
      question.hostHintGuessedOptionIndex,
    );

    return {
      ...question,
      options: shuffled.options,
      correctOptionIndex: shuffled.correctOptionIndex,
      hostHintDisplayedOptionIndex: shuffled.hostHintDisplayedOptionIndex,
    };
  });

  return NextResponse.json({
    quiz: {
      ...quiz,
      questions: normalizedQuestions,
    },
  });
}
