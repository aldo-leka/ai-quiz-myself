import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quizSessions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export const runtime = "nodejs";

const patchQuizSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId } = await params;
  const parsed = patchQuizSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const [updatedQuiz] = await db
    .update(quizzes)
    .set({
      title: parsed.data.title,
    })
    .where(
      and(
        eq(quizzes.id, quizId),
        eq(quizzes.creatorId, session.user.id),
        eq(quizzes.isHub, false),
      ),
    )
    .returning({
      id: quizzes.id,
      title: quizzes.title,
    });

  if (!updatedQuiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, quiz: updatedQuiz });
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { quizId } = await params;
  const [existingQuiz] = await db
    .select({
      id: quizzes.id,
    })
    .from(quizzes)
    .where(
      and(
        eq(quizzes.id, quizId),
        eq(quizzes.creatorId, session.user.id),
        eq(quizzes.isHub, false),
      ),
    )
    .limit(1);

  if (!existingQuiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  await db.delete(quizSessions).where(eq(quizSessions.quizId, quizId));

  await db
    .delete(quizzes)
    .where(
      and(
        eq(quizzes.id, quizId),
        eq(quizzes.creatorId, session.user.id),
        eq(quizzes.isHub, false),
      ),
    );

  return NextResponse.json({ success: true });
}
