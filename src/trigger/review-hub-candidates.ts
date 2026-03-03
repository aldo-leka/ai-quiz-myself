import { createOpenAI } from "@ai-sdk/openai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { generateObject } from "ai";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import {
  checkHubUniqueness,
  generateEmbedding,
  storeQuizEmbedding,
} from "@/lib/quiz-embeddings";

const REVIEW_BATCH_SIZE = 15;
const HUB_DUPLICATE_THRESHOLD = 0.85;

const hubFitSchema = z.object({
  decision: z.enum(["approve", "reject_niche", "reject_polarizing", "reject_unsafe"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(8).max(240),
});

type HubDecision = z.infer<typeof hubFitSchema>["decision"];

type HubCandidate = {
  id: string;
  title: string;
  theme: string;
  language: string;
  sourceType: "ai_generated" | "url";
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
};

function isEnglishLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
}

function parseOptionTexts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const text = "text" in option && typeof option.text === "string" ? option.text.trim() : "";
      return text || null;
    })
    .filter((text): text is string => Boolean(text));
}

function buildReviewPrompt(quiz: HubCandidate, questionRows: Array<{ questionText: string; options: unknown }>) {
  const preview = questionRows
    .slice(0, 8)
    .map((question, index) => {
      const options = parseOptionTexts(question.options).slice(0, 4);
      return [
        `Q${index + 1}: ${question.questionText}`,
        ...options.map((option, optionIndex) => `${String.fromCharCode(65 + optionIndex)}. ${option}`),
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are a strict content curator for QuizPlus Hub random quizzes.",
    "Goal: only approve quizzes that are broadly interesting to a global general audience.",
    "Reject quizzes that are too niche, locally specific, or politically polarizing.",
    "Reject unsafe content (hate, harassment, explicit sexual content, graphic violence).",
    "",
    "Decision policy:",
    "- approve: broad family-friendly interest, neutral, suitable for random discovery.",
    "- reject_niche: too niche/specific for general random audience.",
    "- reject_polarizing: political, ideological, celebrity drama, or likely to cause negative surprise.",
    "- reject_unsafe: unsafe/inappropriate content.",
    "",
    `Quiz title: ${quiz.title}`,
    `Theme: ${quiz.theme}`,
    `Source type: ${quiz.sourceType}`,
    `Game mode: ${quiz.gameMode}`,
    `Difficulty: ${quiz.difficulty}`,
    "",
    "Question preview:",
    preview,
  ].join("\n");
}

async function assessHubFit(quiz: HubCandidate, questionRows: Array<{ questionText: string; options: unknown }>) {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const { object } = await generateObject({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-5-nano"),
    schema: hubFitSchema,
    prompt: buildReviewPrompt(quiz, questionRows),
  });

  return object;
}

async function approveQuiz(quizId: string, embedding: number[]) {
  await db
    .update(quizzes)
    .set({
      isHub: true,
      hubStatus: "approved",
      isFlagged: false,
      flagReason: null,
    })
    .where(eq(quizzes.id, quizId));

  await storeQuizEmbedding(quizId, embedding);
}

async function rejectQuiz(params: {
  quizId: string;
  reason: string;
  decision: HubDecision;
}) {
  await db
    .update(quizzes)
    .set({
      isHub: false,
      hubStatus: "rejected",
      isFlagged: params.decision === "reject_unsafe",
      flagReason: params.reason.slice(0, 500),
    })
    .where(eq(quizzes.id, params.quizId));
}

async function loadHubCandidates(limit: number): Promise<HubCandidate[]> {
  const rows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      language: quizzes.language,
      sourceType: quizzes.sourceType,
      gameMode: quizzes.gameMode,
      difficulty: quizzes.difficulty,
    })
    .from(quizzes)
    .where(
      and(
        eq(quizzes.isPublic, true),
        eq(quizzes.isHub, false),
        eq(quizzes.hubStatus, "pending"),
        inArray(quizzes.sourceType, ["ai_generated", "url"]),
      ),
    )
    .orderBy(asc(quizzes.createdAt))
    .limit(limit);

  return rows as HubCandidate[];
}

export const reviewHubCandidatesTask = schedules.task({
  id: "review-hub-candidates",
  cron: "*/15 * * * *",
  maxDuration: 900,
  run: async () => {
    if (!process.env.OPENAI_API_KEY) {
      logger.error("OPENAI_API_KEY is missing, skipping hub review run");
      return { ok: false, reviewed: 0, approved: 0, rejected: 0, skipped: 0 };
    }

    const candidates = await loadHubCandidates(REVIEW_BATCH_SIZE);
    if (candidates.length === 0) {
      logger.log("No hub candidates to review");
      return { ok: true, reviewed: 0, approved: 0, rejected: 0, skipped: 0 };
    }

    let approved = 0;
    let rejected = 0;
    let skipped = 0;

    for (const quiz of candidates) {
      try {
        const questionRows = await db
          .select({
            questionText: questions.questionText,
            options: questions.options,
          })
          .from(questions)
          .where(eq(questions.quizId, quiz.id))
          .orderBy(asc(questions.position))
          .limit(20);

        const questionTexts = questionRows
          .map((row) => row.questionText.trim())
          .filter((questionText) => questionText.length > 0);

        if (!isEnglishLanguage(quiz.language)) {
          await rejectQuiz({
            quizId: quiz.id,
            decision: "reject_niche",
            reason: "Rejected for hub: only English quizzes are auto-published.",
          });
          rejected += 1;
          continue;
        }

        if (questionTexts.length < 8) {
          await rejectQuiz({
            quizId: quiz.id,
            decision: "reject_niche",
            reason: "Rejected for hub: not enough generated questions for reliable random play.",
          });
          rejected += 1;
          continue;
        }

        const embedding = await generateEmbedding(questionTexts);
        const uniqueness = await checkHubUniqueness(embedding, HUB_DUPLICATE_THRESHOLD);

        if (uniqueness.isDuplicate) {
          await rejectQuiz({
            quizId: quiz.id,
            decision: "reject_niche",
            reason: `Rejected for hub: too similar to existing hub quiz ${uniqueness.mostSimilarQuizId ?? "unknown"}.`,
          });
          rejected += 1;
          continue;
        }

        const hubFit = await assessHubFit(quiz, questionRows);
        if (hubFit.decision === "approve" && hubFit.confidence >= 0.65) {
          await approveQuiz(quiz.id, embedding);
          approved += 1;
          continue;
        }

        await rejectQuiz({
          quizId: quiz.id,
          decision: hubFit.decision,
          reason: `Rejected for hub: ${hubFit.reason}`,
        });
        rejected += 1;
      } catch (error) {
        skipped += 1;
        logger.error("Failed reviewing hub candidate", {
          quizId: quiz.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logger.log("Hub candidate review run completed", {
      reviewed: candidates.length,
      approved,
      rejected,
      skipped,
    });

    return {
      ok: true,
      reviewed: candidates.length,
      approved,
      rejected,
      skipped,
    };
  },
});
