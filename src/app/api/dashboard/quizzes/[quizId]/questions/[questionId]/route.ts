import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { questionDifficultyEnum, questions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{
    quizId: string;
    questionId: string;
  }>;
};

const patchQuestionSchema = z.object({
  questionText: z.string().trim().min(1).optional(),
  options: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        explanation: z.string().trim().min(1),
      }),
    )
    .length(4)
    .optional(),
  correctOptionIndex: z.number().int().min(0).max(3).optional(),
  hostHintReasoning: z.string().trim().min(1).nullable().optional(),
  hostHintGuessedOptionIndex: z.number().int().min(0).max(3).nullable().optional(),
  difficulty: z.enum(questionDifficultyEnum.enumValues).optional(),
  subject: z.string().trim().nullable().optional(),
});

function optionsEqual(
  left: unknown,
  right: Array<{
    text: string;
    explanation: string;
  }>,
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId, questionId } = await params;
  const rawPayload = await request.json();
  const parsed = patchQuestionSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const hostHintReasoningProvided = Object.prototype.hasOwnProperty.call(
    rawPayload,
    "hostHintReasoning",
  );
  const hostHintGuessedOptionIndexProvided = Object.prototype.hasOwnProperty.call(
    rawPayload,
    "hostHintGuessedOptionIndex",
  );

  if (hostHintReasoningProvided !== hostHintGuessedOptionIndexProvided) {
    return NextResponse.json(
      { error: "Host hint reasoning and guessed option must be updated together" },
      { status: 400 },
    );
  }

  if (hostHintReasoningProvided) {
    const hasReasoning =
      typeof payload.hostHintReasoning === "string" && payload.hostHintReasoning.trim().length > 0;
    const hasGuessedOptionIndex = typeof payload.hostHintGuessedOptionIndex === "number";

    if (hasReasoning !== hasGuessedOptionIndex) {
      return NextResponse.json(
        { error: "Provide both Ask the Host fields, or clear both" },
        { status: 400 },
      );
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [existing] = await db
    .select({
      id: questions.id,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
    })
    .from(questions)
    .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
    .where(
      and(
        eq(questions.id, questionId),
        eq(questions.quizId, quizId),
        eq(quizzes.creatorId, session.user.id),
        eq(quizzes.isHub, false),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const questionTextChanged =
    payload.questionText !== undefined && payload.questionText !== existing.questionText;
  const optionsChanged =
    payload.options !== undefined && !optionsEqual(existing.options, payload.options);
  const correctOptionChanged =
    payload.correctOptionIndex !== undefined &&
    payload.correctOptionIndex !== existing.correctOptionIndex;
  const shouldClearStoredHostHint =
    !hostHintReasoningProvided && (questionTextChanged || optionsChanged || correctOptionChanged);

  const [updated] = await db
    .update(questions)
    .set({
      questionText: payload.questionText,
      options: payload.options,
      correctOptionIndex: payload.correctOptionIndex,
      hostHintReasoning: hostHintReasoningProvided
        ? payload.hostHintReasoning ?? null
        : shouldClearStoredHostHint
          ? null
          : undefined,
      hostHintGuessedOptionIndex: hostHintGuessedOptionIndexProvided
        ? payload.hostHintGuessedOptionIndex ?? null
        : shouldClearStoredHostHint
          ? null
          : undefined,
      difficulty: payload.difficulty,
      subject: payload.subject,
    })
    .where(and(eq(questions.id, questionId), eq(questions.quizId, quizId)))
    .returning({
      id: questions.id,
      quizId: questions.quizId,
      position: questions.position,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
      hostHintReasoning: questions.hostHintReasoning,
      hostHintGuessedOptionIndex: questions.hostHintGuessedOptionIndex,
      difficulty: questions.difficulty,
      subject: questions.subject,
    });

  return NextResponse.json({ success: true, question: updated });
}
