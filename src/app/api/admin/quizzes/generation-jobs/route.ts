import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizGenerationJobs, quizzes } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET() {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: quizGenerationJobs.id,
      status: quizGenerationJobs.status,
      inputData: quizGenerationJobs.inputData,
      quizId: quizGenerationJobs.quizId,
      errorMessage: quizGenerationJobs.errorMessage,
      createdAt: quizGenerationJobs.createdAt,
      updatedAt: quizGenerationJobs.updatedAt,
      quizTitle: quizzes.title,
    })
    .from(quizGenerationJobs)
    .leftJoin(quizzes, eq(quizGenerationJobs.quizId, quizzes.id))
    .where(and(eq(quizGenerationJobs.userId, adminSession.user.id), isNull(quizGenerationJobs.dismissedAt)))
    .orderBy(desc(quizGenerationJobs.createdAt))
    .limit(12);

  return NextResponse.json({ jobs: rows });
}
