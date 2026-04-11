import { randomInt, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  hubCandidates,
  questions,
  quizzes,
  socialPipelines,
  socialPostAttempts,
  socialPosts,
  user,
} from "@/db/schema";
import { toAppUrl } from "@/lib/app-base-url";
import { buildPublicQuizPath } from "@/lib/quiz-links";
import {
  buildSocialFrameUrl,
  buildSocialReviewUrl,
  getSocialRenderBaseUrl,
} from "@/lib/social/render-urls";
import type {
  SocialFrameKind,
  SocialInventoryNudge,
  SocialPipelineAllowedGameMode,
  SocialPostStatus,
  SocialPreviewManifest,
  SocialPublishMode,
  SocialQuizSnapshot,
  SocialVariantPreview,
} from "@/lib/social/types";
import {
  DEFAULT_SOCIAL_PIPELINE_SLUG,
  SOCIAL_DEFAULT_LOW_INVENTORY_THRESHOLDS,
  SOCIAL_FRAME_VARIANTS,
  SOCIAL_MAX_QUESTION_COUNT,
  SOCIAL_MIN_QUESTION_COUNT,
  SOCIAL_RESERVATION_TTL_MINUTES,
} from "@/lib/social/types";

type SocialPipelineRecord = typeof socialPipelines.$inferSelect;
type SocialPostRecord = typeof socialPosts.$inferSelect;

type CandidateQuizRow = {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  questionCount: number;
  isHub: boolean;
  creatorName: string | null;
};

type EligibleQuizCandidate = CandidateQuizRow & {
  blockingPost: SocialPostRecord | null;
  creatorName: string | null;
};

export type ReservedSocialPreview = {
  pipeline: SocialPipelineRecord;
  socialPost: SocialPostRecord;
  remainingEligible: number;
  nudge: SocialInventoryNudge | null;
};

function sanitizeAllowedGameModes(
  value: SocialPipelineAllowedGameMode[] | null | undefined,
): SocialPipelineAllowedGameMode[] {
  const uniqueValues = new Set(
    (value ?? []).filter(
      (mode): mode is SocialPipelineAllowedGameMode =>
        mode === "single" || mode === "wwtbam",
    ),
  );

  return uniqueValues.size > 0 ? [...uniqueValues] : ["single", "wwtbam"];
}

function sanitizeThresholds(value: number[] | null | undefined) {
  const next = (value ?? [])
    .filter((threshold) => Number.isInteger(threshold) && threshold >= 0)
    .sort((left, right) => right - left);

  return next.length > 0 ? next : [...SOCIAL_DEFAULT_LOW_INVENTORY_THRESHOLDS];
}

function normalizeQuestionCount(value: number, fallback: number) {
  if (!Number.isInteger(value) || value <= 0) {
    return fallback;
  }

  return value;
}

function getQuestionWindow(pipeline: SocialPipelineRecord, questionCount: number) {
  const minQuestionCount = Math.min(
    Math.max(
      normalizeQuestionCount(pipeline.minQuestionCount, SOCIAL_MIN_QUESTION_COUNT),
      SOCIAL_MIN_QUESTION_COUNT,
    ),
    questionCount,
  );
  const maxQuestionCount = Math.min(
    Math.max(
      normalizeQuestionCount(pipeline.maxQuestionCount, SOCIAL_MAX_QUESTION_COUNT),
      minQuestionCount,
    ),
    questionCount,
  );

  return {
    minQuestionCount,
    maxQuestionCount,
  };
}

function isBlockingSocialPost(post: SocialPostRecord | null | undefined, now: Date) {
  if (!post) {
    return false;
  }

  if (
    post.status === "preview_ready" ||
    post.status === "drafted" ||
    post.status === "published" ||
    post.status === "failed" ||
    post.status === "skipped"
  ) {
    return true;
  }

  if (post.status === "reserved") {
    return post.reservationExpiresAt ? post.reservationExpiresAt > now : true;
  }

  return false;
}

function pickSelectedQuestionCount(pipeline: SocialPipelineRecord, questionCount: number) {
  const { minQuestionCount, maxQuestionCount } = getQuestionWindow(pipeline, questionCount);
  if (maxQuestionCount <= minQuestionCount) {
    return minQuestionCount;
  }

  return randomInt(minQuestionCount, maxQuestionCount + 1);
}

async function getHubCreatorNames(quizIds: string[]) {
  if (quizIds.length === 0) {
    return new Map<string, string | null>();
  }

  const rows = await db
    .select({
      publishedQuizId: hubCandidates.publishedQuizId,
      creatorName: user.name,
    })
    .from(hubCandidates)
    .leftJoin(user, eq(hubCandidates.submittedByUserId, user.id))
    .where(inArray(hubCandidates.publishedQuizId, quizIds));

  return new Map(rows.map((row) => [row.publishedQuizId, row.creatorName ?? null]));
}

async function loadPipelineBySlug(slug: string) {
  const [pipeline] = await db
    .select()
    .from(socialPipelines)
    .where(eq(socialPipelines.slug, slug))
    .limit(1);

  return pipeline ?? null;
}

export async function getOrCreateSocialPipeline(params?: {
  slug?: string;
  name?: string;
  description?: string | null;
  allowedGameModes?: SocialPipelineAllowedGameMode[];
  minQuestionCount?: number;
  maxQuestionCount?: number;
}) {
  const slug = params?.slug?.trim() || DEFAULT_SOCIAL_PIPELINE_SLUG;
  const existing = await loadPipelineBySlug(slug);
  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(socialPipelines)
    .values({
      slug,
      name: params?.name?.trim() || "Organic Publer Main",
      description: params?.description?.trim() || "OpenClaw-managed organic social queue.",
      allowedGameModes: sanitizeAllowedGameModes(params?.allowedGameModes),
      minQuestionCount: Math.max(
        SOCIAL_MIN_QUESTION_COUNT,
        normalizeQuestionCount(params?.minQuestionCount ?? SOCIAL_MIN_QUESTION_COUNT, SOCIAL_MIN_QUESTION_COUNT),
      ),
      maxQuestionCount: Math.max(
        SOCIAL_MAX_QUESTION_COUNT,
        normalizeQuestionCount(params?.maxQuestionCount ?? SOCIAL_MAX_QUESTION_COUNT, SOCIAL_MAX_QUESTION_COUNT),
      ),
      lowInventoryThresholds: [...SOCIAL_DEFAULT_LOW_INVENTORY_THRESHOLDS],
      alertedThresholds: [],
    })
    .onConflictDoUpdate({
      target: socialPipelines.slug,
      set: {
        name: params?.name?.trim() || "Organic Publer Main",
        description: params?.description?.trim() || "OpenClaw-managed organic social queue.",
      },
    })
    .returning();

  return created;
}

async function loadCandidateQuizzes(pipeline: SocialPipelineRecord) {
  const allowedGameModes = sanitizeAllowedGameModes(pipeline.allowedGameModes);
  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      theme: quizzes.theme,
      difficulty: quizzes.difficulty,
      gameMode: quizzes.gameMode,
      questionCount: quizzes.questionCount,
      isHub: quizzes.isHub,
      creatorName: user.name,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(
      and(
        eq(quizzes.isPublic, true),
        inArray(quizzes.gameMode, allowedGameModes),
      ),
    );

  const minQuestionCount = Math.max(
    SOCIAL_MIN_QUESTION_COUNT,
    normalizeQuestionCount(pipeline.minQuestionCount, SOCIAL_MIN_QUESTION_COUNT),
  );
  const filteredRows = rows.filter((row) => row.questionCount >= minQuestionCount);
  const fallbackCreatorMap = await getHubCreatorNames(
    filteredRows.filter((row) => row.creatorName === null && row.isHub).map((row) => row.id),
  );

  return filteredRows.map((row) => ({
    ...row,
    creatorName: row.creatorName ?? fallbackCreatorMap.get(row.id) ?? null,
  })) satisfies CandidateQuizRow[];
}

async function loadPipelinePostsMap(pipelineId: string, quizIds: string[]) {
  if (quizIds.length === 0) {
    return new Map<string, SocialPostRecord>();
  }

  const rows = await db
    .select()
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.pipelineId, pipelineId),
        inArray(socialPosts.quizId, quizIds),
      ),
    );

  return new Map(rows.map((row) => [row.quizId, row]));
}

async function getEligibleQuizCandidates(pipeline: SocialPipelineRecord) {
  const now = new Date();
  const quizRows = await loadCandidateQuizzes(pipeline);
  const postsByQuizId = await loadPipelinePostsMap(
    pipeline.id,
    quizRows.map((row) => row.id),
  );

  return quizRows
    .map((quizRow) => {
      const blockingPost = postsByQuizId.get(quizRow.id) ?? null;
      return {
        ...quizRow,
        blockingPost,
      };
    })
    .filter((quizRow) => !isBlockingSocialPost(quizRow.blockingPost, now)) satisfies EligibleQuizCandidate[];
}

async function maybeCreateInventoryNudge(
  pipeline: SocialPipelineRecord,
  remainingEligible: number,
): Promise<SocialInventoryNudge | null> {
  const thresholds = sanitizeThresholds(pipeline.lowInventoryThresholds);
  const alertedThresholds = new Set(pipeline.alertedThresholds ?? []);
  const matchedThreshold = thresholds
    .filter((threshold) => remainingEligible <= threshold)
    .sort((left, right) => left - right)[0];

  if (matchedThreshold === undefined || alertedThresholds.has(matchedThreshold)) {
    return null;
  }

  const nextAlertedThresholds = [...alertedThresholds, matchedThreshold].sort((left, right) => right - left);
  await db
    .update(socialPipelines)
    .set({
      alertedThresholds: nextAlertedThresholds,
    })
    .where(eq(socialPipelines.id, pipeline.id));

  if (matchedThreshold === 0) {
    return {
      type: "empty_pipeline",
      remainingEligible: 0,
    };
  }

  return {
    type: "low_inventory",
    threshold: matchedThreshold,
    remainingEligible,
  };
}

function createFrameKinds(snapshot: SocialQuizSnapshot): Array<{
  kind: SocialFrameKind;
  questionPosition: number | null;
}> {
  const frames: Array<{
    kind: SocialFrameKind;
    questionPosition: number | null;
  }> = snapshot.questions.map((question, index) => {
    const isLastQuestion = index === snapshot.questions.length - 1;
    const kind: SocialFrameKind =
      snapshot.gameMode === "wwtbam"
        ? isLastQuestion
          ? "wwtbam-question-unanswered"
          : "wwtbam-question-reveal"
        : isLastQuestion
          ? "single-question-unanswered"
          : "single-question-reveal";

    return {
      kind,
      questionPosition: question.position,
    };
  });

  frames.push({
    kind: "cta",
    questionPosition: null,
  });

  return frames;
}

function createPreviewManifest(params: {
  socialPostId: string;
  previewToken: string;
  snapshot: SocialQuizSnapshot;
  baseUrl?: URL;
}) {
  const frameKinds = createFrameKinds(params.snapshot);
  const variants = (
    Object.keys(SOCIAL_FRAME_VARIANTS) as Array<keyof typeof SOCIAL_FRAME_VARIANTS>
  ).map((variant) => ({
    variant,
    width: SOCIAL_FRAME_VARIANTS[variant].width,
    height: SOCIAL_FRAME_VARIANTS[variant].height,
    frameUrls: frameKinds.map((_, index) =>
      buildSocialFrameUrl({
        baseUrl: params.baseUrl,
        socialPostId: params.socialPostId,
        frameIndex: index,
        variant,
        token: params.previewToken,
      }),
    ),
  })) satisfies SocialVariantPreview[];

  return {
    frameCount: frameKinds.length,
    frames: frameKinds.map((frame, index) => ({
      index,
      kind: frame.kind,
      questionPosition: frame.questionPosition,
    })),
    variants,
    reviewUrl: buildSocialReviewUrl({
      baseUrl: params.baseUrl,
      socialPostId: params.socialPostId,
      token: params.previewToken,
    }),
  } satisfies SocialPreviewManifest;
}

export async function buildSocialQuizSnapshot(
  quizId: string,
  selectedQuestionCount: number,
) {
  const [quizRow] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      description: quizzes.description,
      theme: quizzes.theme,
      difficulty: quizzes.difficulty,
      gameMode: quizzes.gameMode,
      questionCount: quizzes.questionCount,
      isHub: quizzes.isHub,
      creatorName: user.name,
    })
    .from(quizzes)
    .leftJoin(user, eq(quizzes.creatorId, user.id))
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quizRow) {
    throw new Error(`Quiz ${quizId} was not found.`);
  }

  if (quizRow.gameMode !== "single" && quizRow.gameMode !== "wwtbam") {
    throw new Error(`Quiz ${quizId} uses unsupported game mode ${quizRow.gameMode}.`);
  }

  let creatorName = quizRow.creatorName;
  if (!creatorName && quizRow.isHub) {
    const fallbackCreatorMap = await getHubCreatorNames([quizRow.id]);
    creatorName = fallbackCreatorMap.get(quizRow.id) ?? null;
  }

  const questionRows = await db
    .select({
      id: questions.id,
      position: questions.position,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
    })
    .from(questions)
    .where(eq(questions.quizId, quizRow.id))
    .orderBy(asc(questions.position));

  const playUrl = toAppUrl(buildPublicQuizPath(quizRow.id, { ref: "share" })).toString();

  return {
    quizId: quizRow.id,
    title: quizRow.title,
    description: quizRow.description,
    theme: quizRow.theme,
    difficulty: quizRow.difficulty,
    gameMode: quizRow.gameMode,
    questionCount: quizRow.questionCount,
    creatorName,
    playUrl,
    selectedQuestionCount,
    questions: questionRows.slice(0, selectedQuestionCount).map((question) => ({
      id: question.id,
      position: question.position,
      questionText: question.questionText,
      options: Array.isArray(question.options)
        ? question.options.map((option) => ({
            text:
              option && typeof option === "object" && "text" in option && typeof option.text === "string"
                ? option.text
                : "",
            explanation:
              option &&
              typeof option === "object" &&
              "explanation" in option &&
              typeof option.explanation === "string"
                ? option.explanation
                : "",
          }))
        : [],
      correctOptionIndex: question.correctOptionIndex,
    })),
  } satisfies SocialQuizSnapshot;
}

export async function reserveSocialPreview(params?: {
  pipelineSlug?: string;
  quizId?: string;
  baseUrl?: string;
}) {
  const pipeline = await getOrCreateSocialPipeline({
    slug: params?.pipelineSlug,
  });
  const candidateQuizzes = await loadCandidateQuizzes(pipeline);
  const eligibleCandidates = await getEligibleQuizCandidates(pipeline);
  const selectedCandidate = params?.quizId
    ? candidateQuizzes
        .map((candidate) => ({
          ...candidate,
          blockingPost: null,
        }))
        .find((candidate) => candidate.id === params.quizId) ?? null
    : eligibleCandidates.length > 0
      ? eligibleCandidates[randomInt(0, eligibleCandidates.length)]
      : null;
  const remainingEligible = eligibleCandidates.length;
  const baseUrl = params?.baseUrl?.trim()
    ? new URL(params.baseUrl)
    : getSocialRenderBaseUrl();

  if (!selectedCandidate) {
    return {
      pipeline,
      socialPost: null,
      remainingEligible,
      nudge: await maybeCreateInventoryNudge(pipeline, remainingEligible),
    } as const;
  }

  const selectedQuestionCount = pickSelectedQuestionCount(
    pipeline,
    selectedCandidate.questionCount,
  );
  const quizSnapshot = await buildSocialQuizSnapshot(
    selectedCandidate.id,
    selectedQuestionCount,
  );
  const previewToken = randomUUID();
  const reservationExpiresAt = new Date(
    Date.now() + SOCIAL_RESERVATION_TTL_MINUTES * 60 * 1000,
  );

  const [socialPost] = await db
    .insert(socialPosts)
    .values({
      pipelineId: pipeline.id,
      quizId: selectedCandidate.id,
      status: "preview_ready",
      previewToken,
      reservationExpiresAt,
      selectedQuestionCount,
      playUrl: quizSnapshot.playUrl,
      quizSnapshot,
      copySnapshot: {
        caption: null,
        firstComment: null,
        tiktokTitle: null,
      },
    })
    .onConflictDoUpdate({
      target: [socialPosts.pipelineId, socialPosts.quizId],
      set: {
        status: "preview_ready",
        previewToken,
        reservationExpiresAt,
        selectedQuestionCount,
        playUrl: quizSnapshot.playUrl,
        quizSnapshot,
        previewManifest: null,
        copySnapshot: {
          caption: null,
          firstComment: null,
          tiktokTitle: null,
        },
        publishMode: null,
        publerWorkspaceId: null,
        publerJobId: null,
        publerResponse: null,
        lastError: null,
        publishedAt: null,
      },
    })
    .returning();

  const previewManifest = createPreviewManifest({
    socialPostId: socialPost.id,
    previewToken,
    snapshot: quizSnapshot,
    baseUrl,
  });

  const [updatedSocialPost] = await db
    .update(socialPosts)
    .set({
      previewManifest,
    })
    .where(eq(socialPosts.id, socialPost.id))
    .returning();

  return {
    pipeline,
    socialPost: updatedSocialPost,
    remainingEligible,
    nudge: await maybeCreateInventoryNudge(
      pipeline,
      Math.max(0, remainingEligible - 1),
    ),
  } satisfies ReservedSocialPreview;
}

export async function getSocialPostById(socialPostId: string) {
  const [socialPost] = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.id, socialPostId))
    .limit(1);

  return socialPost ?? null;
}

export async function getSocialPostForPreview(params: {
  socialPostId: string;
  token: string;
}) {
  const socialPost = await getSocialPostById(params.socialPostId);
  if (!socialPost || socialPost.previewToken !== params.token) {
    return null;
  }

  return socialPost;
}

export async function listSocialPipelineStatus(pipelineSlug = DEFAULT_SOCIAL_PIPELINE_SLUG) {
  const pipeline = await getOrCreateSocialPipeline({
    slug: pipelineSlug,
  });
  const eligibleCandidates = await getEligibleQuizCandidates(pipeline);
  const postRows = await db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.pipelineId, pipeline.id));

  return {
    pipeline,
    remainingEligible: eligibleCandidates.length,
    counts: {
      previewReady: postRows.filter((row) => row.status === "preview_ready").length,
      drafted: postRows.filter((row) => row.status === "drafted").length,
      published: postRows.filter((row) => row.status === "published").length,
      failed: postRows.filter((row) => row.status === "failed").length,
      skipped: postRows.filter((row) => row.status === "skipped").length,
    },
  };
}

export async function recordSocialPostAttempt(params: {
  socialPostId: string;
  stage: string;
  success: boolean;
  requestPayload?: Record<string, unknown> | null;
  responsePayload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  await db.insert(socialPostAttempts).values({
    socialPostId: params.socialPostId,
    stage: params.stage,
    success: params.success,
    requestPayload: params.requestPayload ?? null,
    responsePayload: params.responsePayload ?? null,
    errorMessage: params.errorMessage ?? null,
  });
}

export async function updateSocialPostAfterPublish(params: {
  socialPostId: string;
  status: Extract<SocialPostStatus, "drafted" | "published" | "failed">;
  publishMode: SocialPublishMode;
  caption: string | null;
  firstComment: string | null;
  tiktokTitle: string | null;
  publerWorkspaceId: string | null;
  publerJobId?: string | null;
  publerResponse?: Record<string, unknown> | null;
  lastError?: string | null;
}) {
  const [updatedSocialPost] = await db
    .update(socialPosts)
    .set({
      status: params.status,
      publishMode: params.publishMode,
      copySnapshot: {
        caption: params.caption,
        firstComment: params.firstComment,
        tiktokTitle: params.tiktokTitle,
      },
      publerWorkspaceId: params.publerWorkspaceId,
      publerJobId: params.publerJobId ?? null,
      publerResponse: params.publerResponse ?? null,
      lastError: params.lastError ?? null,
      publishedAt: params.status === "published" ? new Date() : null,
    })
    .where(eq(socialPosts.id, params.socialPostId))
    .returning();

  return updatedSocialPost;
}
