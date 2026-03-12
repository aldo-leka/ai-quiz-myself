import { createOpenAI } from "@ai-sdk/openai";
import { eq } from "drizzle-orm";
import { generateObject } from "ai";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { hubCandidates } from "@/db/schema";
import {
  getHubCandidateQuestionTexts,
  parseHubCandidateSnapshot,
  publishHubCandidateSnapshot,
} from "@/lib/hub-candidates";
import { upsertHubThemeEmbedding } from "@/lib/hub-theme-embeddings";
import {
  checkHubUniqueness,
  generateEmbedding,
  storeQuizEmbedding,
} from "@/lib/quiz-embeddings";

const HUB_DUPLICATE_THRESHOLD = 0.85;
const HUB_APPROVAL_CONFIDENCE_THRESHOLD = 0.85;
const UNSAFE_KEYWORDS = [
  "porn",
  "pornography",
  "adult film",
  "adult actress",
  "adult actor",
  "onlyfans",
  "xxx",
  "erotica",
  "sexual content",
  "explicit content",
] as const;
const NARROW_THEME_PATTERNS = [
  /\blife and career of\b/i,
  /\bbiography of\b/i,
  /\bpersonal life of\b/i,
  /\bnet worth\b/i,
] as const;

const taskPayloadSchema = z.object({
  candidateId: z.string().uuid(),
});

const hubFitSchema = z.object({
  decision: z.enum(["approve", "reject_niche", "reject_polarizing", "reject_unsafe"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(8).max(240),
});

type HubDecision = z.infer<typeof hubFitSchema>["decision"];

function isEnglishLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
}

function buildReviewPrompt(input: {
  title: string;
  theme: string;
  sourceType: "manual" | "ai_generated" | "pdf" | "url";
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  questions: Array<{
    questionText: string;
    options: Array<{ text: string; explanation: string }>;
  }>;
}) {
  const preview = input.questions
    .slice(0, 8)
    .map((question, index) => {
      const options = question.options.slice(0, 4).map((option) => option.text.trim());
      return [
        `Q${index + 1}: ${question.questionText}`,
        ...options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are a strict content curator for QuizPlus Hub random quizzes.",
    "Goal: only approve quizzes that are broadly interesting to a global general audience.",
    "Reject quizzes that are too niche, locally specific, focused on one celebrity/personality, or politically polarizing.",
    "Reject unsafe content (hate, harassment, explicit sexual content, graphic violence).",
    "",
    "Decision policy:",
    "- approve: broad family-friendly interest, neutral, suitable for random discovery.",
    "- reject_niche: too niche/specific for general random audience.",
    "- reject_polarizing: political, ideological, celebrity drama, or likely to cause negative surprise.",
    "- reject_unsafe: unsafe/inappropriate content.",
    "",
    `Quiz title: ${input.title}`,
    `Theme: ${input.theme}`,
    `Source type: ${input.sourceType}`,
    `Game mode: ${input.gameMode}`,
    `Difficulty: ${input.difficulty}`,
    "",
    "Question preview:",
    preview,
  ].join("\n");
}

function hardRejectIfDisallowed(input: {
  title: string;
  theme: string;
}): {
  decision: HubDecision;
  reason: string;
} | null {
  const combined = `${input.title} ${input.theme}`.toLowerCase();

  if (UNSAFE_KEYWORDS.some((keyword) => combined.includes(keyword))) {
    return {
      decision: "reject_unsafe",
      reason: "Rejected for hub: adult/sexual content is not eligible for random hub distribution.",
    };
  }

  if (NARROW_THEME_PATTERNS.some((pattern) => pattern.test(combined))) {
    return {
      decision: "reject_niche",
      reason: "Rejected for hub: single-person biography themes are too narrow for default random hub.",
    };
  }

  return null;
}

async function assessHubFit(input: {
  title: string;
  theme: string;
  sourceType: "manual" | "ai_generated" | "pdf" | "url";
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  questions: Array<{
    questionText: string;
    options: Array<{ text: string; explanation: string }>;
  }>;
}) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5-mini"),
    schema: hubFitSchema,
    prompt: buildReviewPrompt(input),
  });

  return object;
}

async function loadCandidate(candidateId: string) {
  const [candidate] = await db
    .select({
      id: hubCandidates.id,
      status: hubCandidates.status,
      submittedByUserId: hubCandidates.submittedByUserId,
      title: hubCandidates.title,
      theme: hubCandidates.theme,
      language: hubCandidates.language,
      sourceType: hubCandidates.sourceType,
      gameMode: hubCandidates.gameMode,
      difficulty: hubCandidates.difficulty,
      snapshot: hubCandidates.snapshot,
    })
    .from(hubCandidates)
    .where(eq(hubCandidates.id, candidateId))
    .limit(1);

  return candidate ?? null;
}

async function updateCandidateStatus(candidateId: string, params: {
  status: "processing" | "approved" | "rejected" | "failed";
  decision?: "approve" | "reject_niche" | "reject_polarizing" | "reject_unsafe" | null;
  reviewReason?: string | null;
  publishedQuizId?: string | null;
  reviewedAt?: Date | null;
}) {
  await db
    .update(hubCandidates)
    .set({
      status: params.status,
      decision: params.decision ?? null,
      reviewReason: params.reviewReason ?? null,
      publishedQuizId: params.publishedQuizId ?? null,
      reviewedAt: params.reviewedAt ?? null,
    })
    .where(eq(hubCandidates.id, candidateId));
}

export const reviewHubCandidateTask = task({
  id: "review-hub-candidate",
  maxDuration: 900,
  run: async (payload: z.infer<typeof taskPayloadSchema>) => {
    if (!process.env.OPENAI_API_KEY) {
      logger.error("OPENAI_API_KEY is missing, skipping hub candidate review", payload);
      return { ok: false, error: "missing_openai_api_key" };
    }

    const { candidateId } = taskPayloadSchema.parse(payload);
    const candidate = await loadCandidate(candidateId);

    if (!candidate) {
      logger.error("Hub candidate not found", { candidateId });
      return { ok: false, error: "candidate_not_found" };
    }

    if (candidate.status === "approved") {
      return { ok: true, candidateId, skipped: "already_approved" };
    }

    const snapshot = parseHubCandidateSnapshot(candidate.snapshot);
    await updateCandidateStatus(candidateId, {
      status: "processing",
      decision: null,
      reviewReason: null,
      publishedQuizId: null,
      reviewedAt: null,
    });

    try {
      const questionTexts = getHubCandidateQuestionTexts(snapshot);
      if (!isEnglishLanguage(snapshot.language)) {
        await updateCandidateStatus(candidateId, {
          status: "rejected",
          decision: "reject_niche",
          reviewReason: "Rejected for hub: only English quizzes are auto-published.",
          reviewedAt: new Date(),
        });
        return { ok: true, candidateId, approved: false, reason: "non_english" };
      }

      if (questionTexts.length < 8) {
        await updateCandidateStatus(candidateId, {
          status: "rejected",
          decision: "reject_niche",
          reviewReason: "Rejected for hub: not enough generated questions for reliable random play.",
          reviewedAt: new Date(),
        });
        return { ok: true, candidateId, approved: false, reason: "too_few_questions" };
      }

      const hardRejection = hardRejectIfDisallowed({
        title: snapshot.title,
        theme: snapshot.theme,
      });

      if (hardRejection) {
        await updateCandidateStatus(candidateId, {
          status: "rejected",
          decision: hardRejection.decision,
          reviewReason: hardRejection.reason,
          reviewedAt: new Date(),
        });
        return { ok: true, candidateId, approved: false, reason: hardRejection.decision };
      }

      const embedding = await generateEmbedding(questionTexts);
      const uniqueness = await checkHubUniqueness(
        embedding,
        snapshot.gameMode,
        HUB_DUPLICATE_THRESHOLD,
      );

      if (uniqueness.isDuplicate) {
        await updateCandidateStatus(candidateId, {
          status: "rejected",
          decision: "reject_niche",
          reviewReason: `Rejected for hub: too similar to existing hub quiz ${uniqueness.mostSimilarQuizId ?? "unknown"}.`,
          reviewedAt: new Date(),
        });
        return { ok: true, candidateId, approved: false, reason: "duplicate" };
      }

      const hubFit = await assessHubFit({
        title: snapshot.title,
        theme: snapshot.theme,
        sourceType: snapshot.sourceType,
        gameMode: snapshot.gameMode,
        difficulty: snapshot.difficulty,
        questions: snapshot.questions.map((question) => ({
          questionText: question.questionText,
          options: question.options,
        })),
      });

      if (
        hubFit.decision !== "approve" ||
        hubFit.confidence < HUB_APPROVAL_CONFIDENCE_THRESHOLD
      ) {
        const decision =
          hubFit.decision === "approve" ? "reject_niche" : hubFit.decision;
        const reviewReason =
          hubFit.decision === "approve"
            ? `Rejected for hub: review confidence ${hubFit.confidence.toFixed(2)} is below required threshold ${HUB_APPROVAL_CONFIDENCE_THRESHOLD.toFixed(2)}.`
            : `Rejected for hub: ${hubFit.reason}`;

        await updateCandidateStatus(candidateId, {
          status: "rejected",
          decision,
          reviewReason,
          reviewedAt: new Date(),
        });

        return { ok: true, candidateId, approved: false, reason: decision };
      }

      const publishedQuizId = await publishHubCandidateSnapshot(snapshot, {
        creatorId: candidate.submittedByUserId,
      });
      await storeQuizEmbedding(publishedQuizId, embedding);
      await upsertHubThemeEmbedding({
        quizId: publishedQuizId,
        theme: snapshot.theme,
        gameMode: snapshot.gameMode,
      });
      await updateCandidateStatus(candidateId, {
        status: "approved",
        decision: "approve",
        reviewReason: `Approved for hub: ${hubFit.reason}`,
        publishedQuizId,
        reviewedAt: new Date(),
      });

      logger.log("Hub candidate approved", {
        candidateId,
        publishedQuizId,
        similarity: uniqueness.similarity,
      });

      return { ok: true, candidateId, approved: true, publishedQuizId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown review error";
      await updateCandidateStatus(candidateId, {
        status: "failed",
        decision: null,
        reviewReason: message.slice(0, 500),
        reviewedAt: new Date(),
      });

      logger.error("Failed reviewing hub candidate", {
        candidateId,
        error: message,
      });

      return { ok: false, candidateId, error: message };
    }
  },
});
