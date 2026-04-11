import React from "react";
import { ImageResponse } from "next/og";
import { SocialCarouselFrameImage, getSocialFrameDimensions } from "@/lib/social/preview";
import { getSocialPostForPreview } from "@/lib/social/service";
import { SOCIAL_FRAME_VARIANTS, type SocialFrameVariant } from "@/lib/social/types";

export const dynamic = "force-dynamic";

type FrameRouteProps = {
  params: Promise<{
    socialPostId: string;
    frameIndex: string;
  }>;
};

function parseVariant(value: string | null): SocialFrameVariant | null {
  if (!value) {
    return "feed";
  }

  return value in SOCIAL_FRAME_VARIANTS ? (value as SocialFrameVariant) : null;
}

export async function GET(request: Request, { params }: FrameRouteProps) {
  const { socialPostId, frameIndex } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim() ?? "";
  const variant = parseVariant(searchParams.get("variant"));
  const parsedFrameIndex = Number.parseInt(frameIndex, 10);

  if (!token || !variant || !Number.isInteger(parsedFrameIndex) || parsedFrameIndex < 0) {
    return new Response("Invalid frame request.", { status: 400 });
  }

  const socialPost = await getSocialPostForPreview({
    socialPostId,
    token,
  });
  if (!socialPost || !socialPost.previewManifest) {
    return new Response("Frame not found.", { status: 404 });
  }

  if (parsedFrameIndex >= socialPost.previewManifest.frameCount) {
    return new Response("Frame index out of range.", { status: 404 });
  }

  const dimensions = getSocialFrameDimensions(variant);

  return new ImageResponse(
    React.createElement(SocialCarouselFrameImage, {
      snapshot: socialPost.quizSnapshot,
      frameIndex: parsedFrameIndex,
      variant,
    }),
    dimensions,
  );
}
