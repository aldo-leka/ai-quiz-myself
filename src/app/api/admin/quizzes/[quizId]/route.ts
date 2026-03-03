import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizSessions, quizzes } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export const runtime = "nodejs";

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
