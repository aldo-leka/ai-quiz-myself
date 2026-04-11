import { buildSocialFrameUrl, getSocialRenderBaseUrl } from "@/lib/social/render-urls";
import { getSocialPostById, recordSocialPostAttempt, updateSocialPostAfterPublish } from "@/lib/social/service";
import type { SocialPublishMode } from "@/lib/social/types";

const PUBLER_API_BASE_URL = "https://app.publer.com/api/v1";
const PUBLER_JOB_POLL_INTERVAL_MS = 2_000;
const PUBLER_JOB_TIMEOUT_MS = Number.parseInt(process.env.PUBLER_JOB_TIMEOUT_MS ?? "90000", 10);

class PublerJobPollingError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "PublerJobPollingError";
    this.details = details;
  }
}

export type PublerTargetConfig = {
  apiKey: string;
  workspaceId: string;
  instagramAccountId: string | null;
  facebookAccountId: string | null;
  tiktokAccountId: string | null;
};

export type PublishSocialPreviewParams = {
  socialPostId: string;
  caption: string;
  firstComment?: string | null;
  tiktokTitle?: string | null;
  publishMode: SocialPublishMode;
  scheduleAt?: string | null;
  workspaceId?: string | null;
  instagramAccountId?: string | null;
  facebookAccountId?: string | null;
  tiktokAccountId?: string | null;
  apiKey?: string | null;
};

function requireNonEmpty(value: string | null | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required ${name}.`);
  }
  return normalized;
}

function getEnvPublerConfig() {
  const apiKey = process.env.PUBLER_API_KEY?.trim() ?? "";
  const workspaceId = process.env.PUBLER_WORKSPACE_ID?.trim() ?? "";

  if (!apiKey || !workspaceId) {
    return null;
  }

  return {
    apiKey,
    workspaceId,
    instagramAccountId: process.env.PUBLER_INSTAGRAM_ACCOUNT_ID?.trim() || null,
    facebookAccountId: process.env.PUBLER_FACEBOOK_ACCOUNT_ID?.trim() || null,
    tiktokAccountId: process.env.PUBLER_TIKTOK_ACCOUNT_ID?.trim() || null,
  } satisfies PublerTargetConfig;
}

export function resolvePublerTargetConfig(params?: Partial<PublerTargetConfig>) {
  const envConfig = getEnvPublerConfig();
  const apiKey = params?.apiKey?.trim() || envConfig?.apiKey || "";
  const workspaceId = params?.workspaceId?.trim() || envConfig?.workspaceId || "";
  const instagramAccountId =
    params?.instagramAccountId?.trim() || envConfig?.instagramAccountId || null;
  const facebookAccountId =
    params?.facebookAccountId?.trim() || envConfig?.facebookAccountId || null;
  const tiktokAccountId =
    params?.tiktokAccountId?.trim() || envConfig?.tiktokAccountId || null;

  if (!apiKey || !workspaceId) {
    throw new Error(
      "Publer is not fully configured. Set PUBLER_API_KEY and PUBLER_WORKSPACE_ID, or provide them in the request.",
    );
  }

  if (!instagramAccountId && !facebookAccountId && !tiktokAccountId) {
    throw new Error(
      "No Publer target accounts were configured. Provide at least one of Instagram, Facebook, or TikTok.",
    );
  }

  return {
    apiKey,
    workspaceId,
    instagramAccountId,
    facebookAccountId,
    tiktokAccountId,
  } satisfies PublerTargetConfig;
}

function buildPublerHeaders(config: PublerTargetConfig) {
  return {
    Authorization: `Bearer-API ${config.apiKey}`,
    "Publer-Workspace-Id": config.workspaceId,
  };
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      raw: text,
    };
  }
}

async function uploadFrameMedia(params: {
  socialPostId: string;
  frameUrl: string;
  fileName: string;
  config: PublerTargetConfig;
}) {
  const imageResponse = await fetch(params.frameUrl, {
    cache: "no-store",
  });
  if (!imageResponse.ok) {
    throw new Error(`Could not fetch render frame ${params.frameUrl}.`);
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
  const formData = new FormData();
  formData.set(
    "file",
    new Blob([imageBuffer], { type: "image/png" }),
    params.fileName,
  );

  const response = await fetch(`${PUBLER_API_BASE_URL}/media`, {
    method: "POST",
    headers: buildPublerHeaders(params.config),
    body: formData,
  });
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Publer media upload failed: ${JSON.stringify(payload)}`);
  }

  const mediaId = extractPublerMediaId(payload);

  if (!mediaId) {
    throw new Error(`Publer media upload did not return a media id: ${JSON.stringify(payload)}`);
  }

  return {
    mediaId,
    response: payload ?? {},
  };
}

function extractPublerMediaId(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  if ("id" in payload && typeof payload.id === "string") {
    return payload.id;
  }

  if (
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "id" in payload.data &&
    typeof payload.data.id === "string"
  ) {
    return payload.data.id;
  }

  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function extractPublerJobId(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  if ("job_id" in payload && typeof payload.job_id === "string") {
    return payload.job_id;
  }

  if (
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "job_id" in payload.data &&
    typeof payload.data.job_id === "string"
  ) {
    return payload.data.job_id;
  }

  return null;
}

function extractPublerJobStatus(payload: Record<string, unknown> | null) {
  if (!payload) {
    return null;
  }

  if ("status" in payload && typeof payload.status === "string") {
    return payload.status;
  }

  if (
    "data" in payload &&
    payload.data &&
    typeof payload.data === "object" &&
    "status" in payload.data &&
    typeof payload.data.status === "string"
  ) {
    return payload.data.status;
  }

  return null;
}

async function pollPublerJob(params: {
  config: PublerTargetConfig;
  jobId: string;
}) {
  const startedAt = Date.now();
  const deadline = startedAt + PUBLER_JOB_TIMEOUT_MS;
  const observations: Array<Record<string, unknown>> = [];

  while (Date.now() < deadline) {
    const response = await fetch(`${PUBLER_API_BASE_URL}/job_status/${params.jobId}`, {
      headers: buildPublerHeaders(params.config),
      cache: "no-store",
    });
    const payload = await parseJsonResponse(response);
    const status = extractPublerJobStatus(payload);
    const observation = {
      observedAt: new Date().toISOString(),
      httpStatus: response.status,
      status,
      payload: payload ?? null,
    } satisfies Record<string, unknown>;

    observations.push(observation);
    if (observations.length > 10) {
      observations.shift();
    }

    if (!response.ok) {
      throw new PublerJobPollingError(`Publer job polling failed: ${JSON.stringify(payload)}`, {
        jobId: params.jobId,
        timeoutMs: PUBLER_JOB_TIMEOUT_MS,
        elapsedMs: Date.now() - startedAt,
        lastObservation: observation,
        recentObservations: observations,
      });
    }

    if (status === "completed" || status === "complete") {
      return payload;
    }

    if (status === "failed" || status === "error") {
      throw new PublerJobPollingError(`Publer job ${params.jobId} failed: ${JSON.stringify(payload)}`, {
        jobId: params.jobId,
        timeoutMs: PUBLER_JOB_TIMEOUT_MS,
        elapsedMs: Date.now() - startedAt,
        lastObservation: observation,
        recentObservations: observations,
      });
    }

    await sleep(PUBLER_JOB_POLL_INTERVAL_MS);
  }

  const lastObservation = observations.at(-1) ?? null;
  const lastStatus =
    lastObservation && typeof lastObservation.status === "string" ? lastObservation.status : null;

  throw new PublerJobPollingError(
    `Timed out waiting for Publer job ${params.jobId}.${lastStatus ? ` Last status: ${lastStatus}.` : ""}`,
    {
      jobId: params.jobId,
      timeoutMs: PUBLER_JOB_TIMEOUT_MS,
      elapsedMs: Date.now() - startedAt,
      lastObservation,
      recentObservations: observations,
    },
  );
}

function buildCommentCallbacks(firstComment: string | null | undefined) {
  const normalized = firstComment?.trim();
  if (!normalized) {
    return undefined;
  }

  return [
    {
      text: normalized,
      conditions: {
        relation: "AND",
        clauses: {
          age: {
            duration: 1,
            unit: "Minute",
          },
        },
      },
    },
  ];
}

function buildAccountEntry(accountId: string, scheduleAt: string | null | undefined) {
  return scheduleAt?.trim()
    ? {
        id: accountId,
        scheduled_at: scheduleAt.trim(),
      }
    : {
        id: accountId,
      };
}

function buildPostPayload(params: {
  provider: "instagram" | "facebook" | "tiktok";
  accountId: string;
  mediaIds: string[];
  caption: string;
  firstComment?: string | null;
  scheduleAt?: string | null;
  tiktokTitle?: string | null;
}) {
  if (params.provider === "tiktok") {
    return {
      networks: {
        tiktok: {
          type: "photo",
          title: requireNonEmpty(
            params.tiktokTitle?.slice(0, 90) ?? params.caption.slice(0, 90),
            "TikTok title",
          ),
          text: params.caption,
          media: params.mediaIds.map((id) => ({
            id,
            type: "photo",
          })),
          details: {
            privacy: "PUBLIC_TO_EVERYONE",
            comment: true,
            auto_add_music: true,
            promotional: false,
            paid: false,
            reminder: false,
          },
        },
      },
      accounts: [buildAccountEntry(params.accountId, params.scheduleAt)],
    };
  }

  const comments = buildCommentCallbacks(params.firstComment);
  return {
    networks: {
      [params.provider]: {
        type: "photo",
        text: params.caption,
        media: params.mediaIds.map((id) => ({
          id,
          type: "photo",
        })),
      },
    },
    accounts: [
      {
        ...buildAccountEntry(params.accountId, params.scheduleAt),
        ...(comments ? { comments } : {}),
      },
    ],
  };
}

type PublerProvider = "instagram" | "facebook" | "tiktok";

type PublerCreateJobResult = {
  jobId: string;
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
};

type PublerPlatformPlan = {
  provider: PublerProvider;
  accountId: string;
  mediaIds: string[];
  caption: string;
  firstComment?: string | null;
  scheduleAt?: string | null;
  tiktokTitle?: string | null;
};

type PublerPlatformResult = {
  provider: PublerProvider;
  accountId: string;
  success: boolean;
  jobId: string | null;
  createPostJobRequest: Record<string, unknown> | null;
  createPostJobResponse: Record<string, unknown> | null;
  finalJobPayload: Record<string, unknown> | null;
  errorMessage: string | null;
  pollDiagnostics: Record<string, unknown> | null;
};

class PublerPlatformFailuresError extends Error {
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = "PublerPlatformFailuresError";
    this.details = details;
  }
}

function summarizePublerJobIds(results: PublerPlatformResult[]) {
  const parts = results
    .filter((result) => result.jobId)
    .map((result) => `${result.provider}:${result.jobId}`);

  return parts.length > 0 ? parts.join(",") : null;
}

function summarizePlatformFailures(results: PublerPlatformResult[]) {
  return results
    .filter((result) => !result.success)
    .map((result) => `${result.provider}: ${result.errorMessage ?? "Unknown error"}`)
    .join(" | ");
}

async function createPublerPostJob(params: {
  config: PublerTargetConfig;
  publishMode: SocialPublishMode;
  posts: Array<Record<string, unknown>>;
}) {
  const endpoint =
    params.publishMode === "publish"
      ? `${PUBLER_API_BASE_URL}/posts/schedule/publish`
      : `${PUBLER_API_BASE_URL}/posts/schedule`;
  const payload = {
    bulk: {
      state: params.publishMode === "draft" ? "draft" : "scheduled",
      posts: params.posts,
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...buildPublerHeaders(params.config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responsePayload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(`Publer post creation failed: ${JSON.stringify(responsePayload)}`);
  }

  const jobId = extractPublerJobId(responsePayload);
  if (!jobId) {
    throw new Error(`Publer post creation did not return a job id: ${JSON.stringify(responsePayload)}`);
  }

  return {
    jobId,
    requestPayload: payload,
    responsePayload: responsePayload ?? {},
  } satisfies PublerCreateJobResult;
}

async function publishPlatformToPubler(params: {
  socialPostId: string;
  config: PublerTargetConfig;
  publishMode: SocialPublishMode;
  plan: PublerPlatformPlan;
}) {
  let createResult: PublerCreateJobResult | null = null;

  try {
    createResult = await createPublerPostJob({
      config: params.config,
      publishMode: params.publishMode,
      posts: [
        buildPostPayload({
          provider: params.plan.provider,
          accountId: params.plan.accountId,
          mediaIds: params.plan.mediaIds,
          caption: params.plan.caption,
          firstComment: params.plan.firstComment,
          scheduleAt: params.plan.scheduleAt,
          tiktokTitle: params.plan.tiktokTitle,
        }),
      ],
    });

    await recordSocialPostAttempt({
      socialPostId: params.socialPostId,
      stage: `create_post_job_${params.plan.provider}`,
      success: true,
      requestPayload: createResult.requestPayload,
      responsePayload: createResult.responsePayload,
    });

    const finalJobPayload = await pollPublerJob({
      config: params.config,
      jobId: createResult.jobId,
    });

    await recordSocialPostAttempt({
      socialPostId: params.socialPostId,
      stage: `poll_post_job_${params.plan.provider}`,
      success: true,
      requestPayload: {
        provider: params.plan.provider,
        jobId: createResult.jobId,
      },
      responsePayload: finalJobPayload ?? {},
    });

    return {
      provider: params.plan.provider,
      accountId: params.plan.accountId,
      success: true,
      jobId: createResult.jobId,
      createPostJobRequest: createResult.requestPayload,
      createPostJobResponse: createResult.responsePayload,
      finalJobPayload: finalJobPayload ?? null,
      errorMessage: null,
      pollDiagnostics: null,
    } satisfies PublerPlatformResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Publer platform publish error";
    const debugPayload = {
      provider: params.plan.provider,
      accountId: params.plan.accountId,
      publerJobId: createResult?.jobId ?? null,
      createPostJobResponse: createResult?.responsePayload ?? null,
      pollDiagnostics: error instanceof PublerJobPollingError ? error.details : null,
      timeoutMs: PUBLER_JOB_TIMEOUT_MS,
    } satisfies Record<string, unknown>;

    await recordSocialPostAttempt({
      socialPostId: params.socialPostId,
      stage: `publish_failed_${params.plan.provider}`,
      success: false,
      requestPayload: createResult?.requestPayload ?? {
        provider: params.plan.provider,
        accountId: params.plan.accountId,
      },
      responsePayload: debugPayload,
      errorMessage: message,
    });

    return {
      provider: params.plan.provider,
      accountId: params.plan.accountId,
      success: false,
      jobId: createResult?.jobId ?? null,
      createPostJobRequest: createResult?.requestPayload ?? null,
      createPostJobResponse: createResult?.responsePayload ?? null,
      finalJobPayload: null,
      errorMessage: message,
      pollDiagnostics: error instanceof PublerJobPollingError ? error.details : null,
    } satisfies PublerPlatformResult;
  }
}

export async function publishSocialPreviewToPubler(params: PublishSocialPreviewParams) {
  const socialPost = await getSocialPostById(params.socialPostId);
  if (!socialPost) {
    throw new Error(`Social post ${params.socialPostId} was not found.`);
  }

  if (!socialPost.previewManifest) {
    throw new Error(`Social post ${params.socialPostId} does not have a preview manifest yet.`);
  }

  const config = resolvePublerTargetConfig({
    apiKey: params.apiKey ?? undefined,
    workspaceId: params.workspaceId ?? undefined,
    instagramAccountId: params.instagramAccountId ?? undefined,
    facebookAccountId: params.facebookAccountId ?? undefined,
    tiktokAccountId: params.tiktokAccountId ?? undefined,
  });
  const renderBaseUrl = getSocialRenderBaseUrl();
  const feedVariant = socialPost.previewManifest.variants.find((variant) => variant.variant === "feed");
  const storyVariant = socialPost.previewManifest.variants.find((variant) => variant.variant === "story");

  if (!feedVariant || !storyVariant) {
    throw new Error(`Social post ${params.socialPostId} is missing one or more media variants.`);
  }

  const uploadStageRequest = {
    socialPostId: params.socialPostId,
    feedFrameCount: feedVariant.frameUrls.length,
    storyFrameCount: storyVariant.frameUrls.length,
    publishMode: params.publishMode,
  };

  const platformResults: PublerPlatformResult[] = [];

  try {
    await recordSocialPostAttempt({
      socialPostId: params.socialPostId,
      stage: "upload_media",
      success: true,
      requestPayload: uploadStageRequest,
    });

    const feedMediaIds = await Promise.all(
      feedVariant.frameUrls.map(async (_, index) => {
        const frameUrl = buildSocialFrameUrl({
          baseUrl: renderBaseUrl,
          socialPostId: socialPost.id,
          frameIndex: index,
          variant: "feed",
          token: socialPost.previewToken,
        });

        const uploaded = await uploadFrameMedia({
          socialPostId: socialPost.id,
          frameUrl,
          fileName: `quizplus-${socialPost.id}-feed-${index + 1}.png`,
          config,
        });

        return uploaded.mediaId;
      }),
    );

    const storyMediaIds = await Promise.all(
      storyVariant.frameUrls.map(async (_, index) => {
        const frameUrl = buildSocialFrameUrl({
          baseUrl: renderBaseUrl,
          socialPostId: socialPost.id,
          frameIndex: index,
          variant: "story",
          token: socialPost.previewToken,
        });

        const uploaded = await uploadFrameMedia({
          socialPostId: socialPost.id,
          frameUrl,
          fileName: `quizplus-${socialPost.id}-story-${index + 1}.png`,
          config,
        });

        return uploaded.mediaId;
      }),
    );

    const plans: PublerPlatformPlan[] = [];
    if (config.instagramAccountId) {
      plans.push({
        provider: "instagram",
        accountId: config.instagramAccountId,
        mediaIds: feedMediaIds,
        caption: params.caption,
        firstComment: params.firstComment,
        scheduleAt: params.scheduleAt,
      });
    }

    if (config.facebookAccountId) {
      plans.push({
        provider: "facebook",
        accountId: config.facebookAccountId,
        mediaIds: feedMediaIds,
        caption: params.caption,
        firstComment: params.firstComment,
        scheduleAt: params.scheduleAt,
      });
    }

    if (config.tiktokAccountId) {
      plans.push({
        provider: "tiktok",
        accountId: config.tiktokAccountId,
        mediaIds: storyMediaIds,
        caption: params.caption,
        scheduleAt: params.scheduleAt,
        tiktokTitle: params.tiktokTitle,
      });
    }

    for (const plan of plans) {
      platformResults.push(
        await publishPlatformToPubler({
          socialPostId: params.socialPostId,
          config,
          publishMode: params.publishMode,
          plan,
        }),
      );
    }

    const successPayload = {
      timeoutMs: PUBLER_JOB_TIMEOUT_MS,
      jobResults: platformResults,
      successfulProviders: platformResults.filter((result) => result.success).map((result) => result.provider),
      failedProviders: platformResults.filter((result) => !result.success).map((result) => result.provider),
    } satisfies Record<string, unknown>;

    const failedProviders = platformResults.filter((result) => !result.success);
    if (failedProviders.length > 0) {
      throw new PublerPlatformFailuresError(
        `Publer publish failed for ${failedProviders.map((result) => result.provider).join(", ")}. ${summarizePlatformFailures(platformResults)}`,
        successPayload,
      );
    }

    const updatedSocialPost = await updateSocialPostAfterPublish({
      socialPostId: params.socialPostId,
      status: params.publishMode === "draft" ? "drafted" : "published",
      publishMode: params.publishMode,
      caption: params.caption,
      firstComment: params.firstComment ?? null,
      tiktokTitle: params.tiktokTitle ?? null,
      publerWorkspaceId: config.workspaceId,
      publerJobId: summarizePublerJobIds(platformResults),
      publerResponse: successPayload,
    });

    return {
      socialPost: updatedSocialPost,
      publer: {
        jobResults: platformResults,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Publer publishing error";
    const debugPayload =
      error instanceof PublerPlatformFailuresError
        ? error.details
        : ({
            timeoutMs: PUBLER_JOB_TIMEOUT_MS,
            jobResults: platformResults,
            successfulProviders: platformResults
              .filter((result) => result.success)
              .map((result) => result.provider),
            failedProviders: platformResults
              .filter((result) => !result.success)
              .map((result) => result.provider),
          } satisfies Record<string, unknown>);

    await recordSocialPostAttempt({
      socialPostId: params.socialPostId,
      stage: "publish_failed",
      success: false,
      requestPayload: uploadStageRequest,
      responsePayload: debugPayload,
      errorMessage: message,
    });
    await updateSocialPostAfterPublish({
      socialPostId: params.socialPostId,
      status: "failed",
      publishMode: params.publishMode,
      caption: params.caption,
      firstComment: params.firstComment ?? null,
      tiktokTitle: params.tiktokTitle ?? null,
      publerWorkspaceId: config.workspaceId,
      publerJobId: summarizePublerJobIds(platformResults),
      publerResponse: debugPayload,
      lastError: message,
    });
    throw error;
  }
}
