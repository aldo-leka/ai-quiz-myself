import { NextResponse } from "next/server";
import { z } from "zod";
import { getInternalSocialAuthErrorResponse, isInternalSocialRequestAuthorized } from "@/lib/social/internal-auth";
import { publishSocialPreviewToPubler } from "@/lib/social/publer";

const publishPayloadSchema = z
  .object({
    socialPostId: z.string().uuid(),
    caption: z.string().trim().min(1).max(4000),
    firstComment: z.string().trim().min(1).max(2200).optional().nullable(),
    tiktokTitle: z.string().trim().min(1).max(90).optional().nullable(),
    publishMode: z.enum(["draft", "publish", "schedule"]).default("draft"),
    scheduleAt: z.string().datetime().optional().nullable(),
    workspaceId: z.string().trim().min(1).optional().nullable(),
    instagramAccountId: z.string().trim().min(1).optional().nullable(),
    facebookAccountId: z.string().trim().min(1).optional().nullable(),
    tiktokAccountId: z.string().trim().min(1).optional().nullable(),
    apiKey: z.string().trim().min(1).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.publishMode === "schedule" && !value.scheduleAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduleAt is required when publishMode is schedule.",
        path: ["scheduleAt"],
      });
    }
  });

export async function POST(request: Request) {
  if (!isInternalSocialRequestAuthorized(request)) {
    return getInternalSocialAuthErrorResponse();
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = publishPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid publish payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await publishSocialPreviewToPubler(parsed.data);

    return NextResponse.json({
      success: true,
      socialPost: {
        id: result.socialPost.id,
        status: result.socialPost.status,
        publishMode: result.socialPost.publishMode,
        publerJobId: result.socialPost.publerJobId,
        publishedAt: result.socialPost.publishedAt?.toISOString() ?? null,
        lastError: result.socialPost.lastError,
      },
      publer: result.publer,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected publish error",
      },
      { status: 500 },
    );
  }
}
