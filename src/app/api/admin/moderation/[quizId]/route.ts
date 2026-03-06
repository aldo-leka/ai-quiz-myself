import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { hubCandidates } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import {
  getHubCandidateQuestionTexts,
  parseHubCandidateSnapshot,
  publishHubCandidateSnapshot,
} from "@/lib/hub-candidates";
import {
  checkHubUniqueness,
  generateEmbedding,
  storeQuizEmbedding,
} from "@/lib/quiz-embeddings";

type RouteContext = {
  params: Promise<{ quizId: string }>;
};

export async function PATCH(_: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { quizId } = await params;
  const [candidate] = await db
    .select({
      id: hubCandidates.id,
      status: hubCandidates.status,
      snapshot: hubCandidates.snapshot,
    })
    .from(hubCandidates)
    .where(eq(hubCandidates.id, quizId))
    .limit(1);

  if (!candidate) {
    return NextResponse.json({ error: "Hub candidate not found" }, { status: 404 });
  }

  const snapshot = parseHubCandidateSnapshot(candidate.snapshot);
  const embedding = await generateEmbedding(getHubCandidateQuestionTexts(snapshot));
  const uniqueness = await checkHubUniqueness(embedding, snapshot.gameMode, 0.85);

  if (uniqueness.isDuplicate) {
    return NextResponse.json(
      {
        error: `Too similar to existing hub quiz ${uniqueness.mostSimilarQuizId ?? "unknown"}.`,
      },
      { status: 409 },
    );
  }

  const publishedQuizId = await publishHubCandidateSnapshot(snapshot);
  await storeQuizEmbedding(publishedQuizId, embedding);

  await db
    .update(hubCandidates)
    .set({
      status: "approved",
      decision: "approve",
      reviewReason: "Approved manually by admin moderation.",
      publishedQuizId,
      reviewedAt: new Date(),
    })
    .where(eq(hubCandidates.id, quizId));

  return NextResponse.json({ success: true, publishedQuizId });
}

export async function DELETE(_: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { quizId } = await params;
  const [deleted] = await db
    .delete(hubCandidates)
    .where(eq(hubCandidates.id, quizId))
    .returning({ id: hubCandidates.id });

  if (!deleted) {
    return NextResponse.json({ error: "Hub candidate not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
