import { getConfiguredAppBaseUrl } from "@/lib/app-base-url";
import type { SocialFrameVariant } from "@/lib/social/types";

function parseBaseUrl(value: string, envName: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
    return new URL(parsed.origin);
  } catch {
    throw new Error(`Invalid ${envName}: ${value}`);
  }
}

export function getSocialRenderBaseUrl() {
  const override = process.env.SOCIAL_RENDER_BASE_URL?.trim();
  if (override) {
    return parseBaseUrl(override, "SOCIAL_RENDER_BASE_URL");
  }

  return getConfiguredAppBaseUrl();
}

export function buildSocialReviewUrl(params: {
  baseUrl?: URL;
  socialPostId: string;
  token: string;
}) {
  const baseUrl = params.baseUrl ?? getSocialRenderBaseUrl();
  const url = new URL(`/social/review/${params.socialPostId}`, baseUrl);
  url.searchParams.set("token", params.token);
  return url.toString();
}

export function buildSocialFrameUrl(params: {
  baseUrl?: URL;
  socialPostId: string;
  frameIndex: number;
  variant: SocialFrameVariant;
  token: string;
}) {
  const baseUrl = params.baseUrl ?? getSocialRenderBaseUrl();
  const url = new URL(
    `/api/social/posts/${params.socialPostId}/frames/${params.frameIndex}`,
    baseUrl,
  );
  url.searchParams.set("variant", params.variant);
  url.searchParams.set("token", params.token);
  return url.toString();
}
