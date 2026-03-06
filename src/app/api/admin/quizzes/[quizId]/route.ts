import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { quizSessions, quizzes } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export const runtime = "nodejs";

const patchQuizSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export async function PATCH(request: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    .where(eq(quizzes.id, quizId))
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
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { quizId } = await params;

  await db.delete(quizSessions).where(eq(quizSessions.quizId, quizId));

  const [deletedQuiz] = await db
    .delete(quizzes)
    .where(eq(quizzes.id, quizId))
    .returning({ id: quizzes.id });

  if (!deletedQuiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, quizId: deletedQuiz.id });
}
