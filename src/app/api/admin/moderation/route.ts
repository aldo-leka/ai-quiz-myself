import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { hubCandidates } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import { parseHubCandidateSnapshot } from "@/lib/hub-candidates";

export async function GET() {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const flagged = await db
    .select({
      id: hubCandidates.id,
      title: hubCandidates.title,
      theme: hubCandidates.theme,
      gameMode: hubCandidates.gameMode,
      sourceType: hubCandidates.sourceType,
      language: hubCandidates.language,
      decision: hubCandidates.decision,
      reviewReason: hubCandidates.reviewReason,
      creatorId: hubCandidates.submittedByUserId,
      creatorName: user.name,
      creatorEmail: user.email,
      createdAt: hubCandidates.createdAt,
      snapshot: hubCandidates.snapshot,
    })
    .from(hubCandidates)
    .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
    .where(eq(hubCandidates.decision, "reject_unsafe"));

  if (flagged.length === 0) {
    return NextResponse.json({ quizzes: [] });
  }

  const quizzesWithPreview = flagged.map((quiz) => ({
    ...quiz,
    questionPreview: parseHubCandidateSnapshot(quiz.snapshot).questions.slice(0, 3).map((question) => ({
      position: question.position,
      questionText: question.questionText,
    })),
  }));

  return NextResponse.json({ quizzes: quizzesWithPreview });
}
