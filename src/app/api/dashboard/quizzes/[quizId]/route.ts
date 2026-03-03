import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizSessions, quizzes } from "@/db/schema";
import { getUserSessionOrNull } from "@/lib/user-auth";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export const runtime = "nodejs";

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
    .where(and(eq(quizzes.id, quizId), eq(quizzes.creatorId, session.user.id)))
    .limit(1);

  if (!existingQuiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  await db.delete(quizSessions).where(eq(quizSessions.quizId, quizId));

  await db
    .delete(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.creatorId, session.user.id)));

  return NextResponse.json({ success: true });
}
