import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizzes } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export async function PATCH(_: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { quizId } = await params;
  const [updated] = await db
    .update(quizzes)
    .set({
      isFlagged: false,
      flagReason: null,
    })
    .where(eq(quizzes.id, quizId))
    .returning({ id: quizzes.id });

  if (!updated) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { quizId } = await params;
  const [deleted] = await db
    .delete(quizzes)
    .where(eq(quizzes.id, quizId))
    .returning({ id: quizzes.id });

  if (!deleted) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

