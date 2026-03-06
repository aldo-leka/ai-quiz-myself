import { eq } from "drizzle-orm";
import { AdminModerationPageClient } from "@/components/admin/admin-moderation-page-client";
import { db } from "@/db";
import { hubCandidates } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { parseHubCandidateSnapshot } from "@/lib/hub-candidates";

export default async function AdminModerationPage() {
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
      creatorName: user.name,
      creatorEmail: user.email,
      createdAt: hubCandidates.createdAt,
      snapshot: hubCandidates.snapshot,
    })
    .from(hubCandidates)
    .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
    .where(eq(hubCandidates.decision, "reject_unsafe"));

  if (flagged.length === 0) {
    return <AdminModerationPageClient initialQuizzes={[]} />;
  }

  return (
    <AdminModerationPageClient
      initialQuizzes={flagged.map((quiz) => ({
        ...quiz,
        createdAt: quiz.createdAt.toISOString(),
        questionPreview: parseHubCandidateSnapshot(quiz.snapshot).questions.slice(0, 3).map((question) => ({
          position: question.position,
          questionText: question.questionText,
        })),
      }))}
    />
  );
}
