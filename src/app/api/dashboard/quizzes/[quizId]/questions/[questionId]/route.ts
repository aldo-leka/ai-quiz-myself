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
  difficulty: z.enum(questionDifficultyEnum.enumValues).optional(),
  subject: z.string().trim().nullable().optional(),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId, questionId } = await params;
  const parsed = patchQuestionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: questions.id })
    .from(questions)
    .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
    .where(
      and(
        eq(questions.id, questionId),
        eq(questions.quizId, quizId),
        eq(quizzes.creatorId, session.user.id),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(questions)
    .set({
      questionText: payload.questionText,
      options: payload.options,
      correctOptionIndex: payload.correctOptionIndex,
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
      difficulty: questions.difficulty,
      subject: questions.subject,
    });

  return NextResponse.json({ success: true, question: updated });
}
