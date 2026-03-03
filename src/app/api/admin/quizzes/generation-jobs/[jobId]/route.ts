import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { quizGenerationJobs } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export const runtime = "nodejs";

export async function PATCH(_: Request, { params }: RouteContext) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { jobId } = await params;
  const [updated] = await db
    .update(quizGenerationJobs)
    .set({
      dismissedAt: new Date(),
    })
    .where(and(eq(quizGenerationJobs.id, jobId), eq(quizGenerationJobs.userId, adminSession.user.id)))
    .returning({ id: quizGenerationJobs.id });

  if (!updated) {
    return NextResponse.json({ error: "Generation job not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
