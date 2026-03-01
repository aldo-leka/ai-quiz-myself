import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quizSessionAnswers, quizSessions, quizzes } from "@/db/schema";
import { auth } from "@/lib/auth";

const payloadSchema = z.object({
  quizId: z.string().uuid(),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  score: z.number().int().nonnegative(),
  players: z
    .array(
      z.object({
        name: z.string().min(1),
        isOwner: z.boolean(),
      }),
    )
    .optional(),
  startedAt: z.string(),
  finishedAt: z.string(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      playerName: z.string().min(1).optional(),
      selectedOptionIndex: z.number().int().min(0).max(3).nullable(),
      isCorrect: z.boolean(),
      timeTakenMs: z.number().int().nonnegative(),
      createdAt: z.string().optional(),
    }),
  ),
});

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({
      headers: new Headers(await headers()),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payloadResult = payloadSchema.safeParse(await request.json());

  if (!payloadResult.success) {
    return NextResponse.json(
      {
        error: "Invalid payload",
        issues: payloadResult.error.issues,
      },
      { status: 400 },
    );
  }

  const payload = payloadResult.data;

  const [quiz] = await db.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.id, payload.quizId)).limit(1);

  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const [createdSession] = await db
    .insert(quizSessions)
    .values({
      quizId: payload.quizId,
      userId: session.user.id,
      gameMode: payload.gameMode,
      players: payload.players ?? [{ name: session.user.name, isOwner: true }],
      totalScore: payload.score,
      startedAt: new Date(payload.startedAt),
      finishedAt: new Date(payload.finishedAt),
    })
    .returning({ id: quizSessions.id });

  const fallbackPlayerName = payload.players?.[0]?.name ?? session.user.name;

  if (payload.answers.length > 0) {
    await db.insert(quizSessionAnswers).values(
      payload.answers.map((answer) => ({
        sessionId: createdSession.id,
        questionId: answer.questionId,
        playerName: answer.playerName ?? fallbackPlayerName,
        selectedOptionIndex: answer.selectedOptionIndex,
        isCorrect: answer.isCorrect,
        timeTakenMs: answer.timeTakenMs,
        createdAt: answer.createdAt ? new Date(answer.createdAt) : new Date(),
      })),
    );
  }

  return NextResponse.json({ success: true, sessionId: createdSession.id });
}
