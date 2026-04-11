import { NextResponse } from "next/server";
import { z } from "zod";
import { getInternalSocialAuthErrorResponse, isInternalSocialRequestAuthorized } from "@/lib/social/internal-auth";
import { reserveSocialPreview } from "@/lib/social/service";

const reservePayloadSchema = z.object({
  pipelineSlug: z.string().trim().min(1).optional(),
  quizId: z.string().uuid().optional(),
  baseUrl: z.string().url().optional(),
});

export async function POST(request: Request) {
  if (!isInternalSocialRequestAuthorized(request)) {
    return getInternalSocialAuthErrorResponse();
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = reservePayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reserve-next payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await reserveSocialPreview(parsed.data);
  if (!result.socialPost) {
    return NextResponse.json({
      status: "empty",
      pipeline: {
        id: result.pipeline.id,
        slug: result.pipeline.slug,
        name: result.pipeline.name,
      },
      remainingEligible: result.remainingEligible,
      nudge: result.nudge,
    });
  }

  return NextResponse.json({
    status: "ok",
    pipeline: {
      id: result.pipeline.id,
      slug: result.pipeline.slug,
      name: result.pipeline.name,
    },
    remainingEligible: result.remainingEligible,
    nudge: result.nudge,
    socialPost: {
      id: result.socialPost.id,
      status: result.socialPost.status,
      previewToken: result.socialPost.previewToken,
      reviewUrl: result.socialPost.previewManifest?.reviewUrl ?? null,
      previewManifest: result.socialPost.previewManifest,
      reservationExpiresAt: result.socialPost.reservationExpiresAt?.toISOString() ?? null,
      playUrl: result.socialPost.playUrl,
      quizSnapshot: result.socialPost.quizSnapshot,
    },
  });
}
