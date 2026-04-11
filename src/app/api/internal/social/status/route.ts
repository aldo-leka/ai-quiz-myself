import { NextResponse } from "next/server";
import { getInternalSocialAuthErrorResponse, isInternalSocialRequestAuthorized } from "@/lib/social/internal-auth";
import { listSocialPipelineStatus } from "@/lib/social/service";

export async function GET(request: Request) {
  if (!isInternalSocialRequestAuthorized(request)) {
    return getInternalSocialAuthErrorResponse();
  }

  const { searchParams } = new URL(request.url);
  const pipelineSlug = searchParams.get("pipelineSlug")?.trim() || undefined;
  const result = await listSocialPipelineStatus(pipelineSlug);

  return NextResponse.json({
    pipeline: {
      id: result.pipeline.id,
      slug: result.pipeline.slug,
      name: result.pipeline.name,
      isActive: result.pipeline.isActive,
      allowedGameModes: result.pipeline.allowedGameModes,
      minQuestionCount: result.pipeline.minQuestionCount,
      maxQuestionCount: result.pipeline.maxQuestionCount,
      lowInventoryThresholds: result.pipeline.lowInventoryThresholds,
      alertedThresholds: result.pipeline.alertedThresholds,
    },
    remainingEligible: result.remainingEligible,
    counts: result.counts,
  });
}
