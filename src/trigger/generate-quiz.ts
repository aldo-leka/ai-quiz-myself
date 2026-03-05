import { eq } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions, questions, quizGenerationJobs, quizzes } from "@/db/schema";
import type { GenerationBillingMode } from "@/lib/billing";
import {
  checkHubUniqueness,
  generateEmbedding,
  storeQuizEmbedding,
} from "@/lib/quiz-embeddings";
import {
  generateQuizFromPrompt,
  getExistingQuestionsForTheme,
  type QuizGenerationDifficulty,
  type QuizGenerationGameMode,
} from "@/lib/quiz-generation";
import { extractArticleText } from "@/lib/url-extraction";
import { getLanguageModel, resolveUserApiKey } from "@/lib/user-api-keys";
import { tryDeductWalletBalanceCents } from "@/lib/wallet";

const taskPayloadSchema = z.object({
  jobId: z.string().uuid(),
});

const jobInputSchema = z.object({
  theme: z.string().min(2).optional(),
  url: z.string().url().optional(),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  language: z.string().min(2).default("en"),
  isHub: z.boolean().default(false),
  reviewForHub: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  apiKeyId: z.string().uuid().optional(),
  billingMode: z.enum(["byok", "platform_credits"]).default("byok"),
  billingAmountCents: z.number().int().nonnegative().default(0),
  fileName: z.string().min(1).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
});

type GenerationSourceType = "theme" | "url" | "pdf";
type JobInput = z.infer<typeof jobInputSchema>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown generation error";
}

function isEnglishLanguage(language: string): boolean {
  const normalized = language.trim().toLowerCase();
  return normalized === "en" || normalized.startsWith("en-");
}

function mapGenerationSourceToQuizSource(
  sourceType: GenerationSourceType,
): "ai_generated" | "url" | "pdf" {
  if (sourceType === "url") return "url";
  if (sourceType === "pdf") return "pdf";
  return "ai_generated";
}

async function setJobStatus(
  jobId: string,
  update: {
    status: "processing" | "completed" | "failed";
    quizId?: string | null;
    errorMessage?: string | null;
  },
) {
  await db
    .update(quizGenerationJobs)
    .set({
      status: update.status,
      quizId: update.quizId ?? null,
      errorMessage: update.errorMessage ?? null,
    })
    .where(eq(quizGenerationJobs.id, jobId));
}

async function loadJob(jobId: string) {
  const [job] = await db
    .select({
      id: quizGenerationJobs.id,
      userId: quizGenerationJobs.userId,
      sourceType: quizGenerationJobs.sourceType,
      inputData: quizGenerationJobs.inputData,
    })
    .from(quizGenerationJobs)
    .where(eq(quizGenerationJobs.id, jobId))
    .limit(1);

  return job ?? null;
}

function parseInputData(inputData: unknown): JobInput {
  const parsed = jobInputSchema.safeParse(inputData);
  if (!parsed.success) {
    throw new Error("Invalid quiz generation payload");
  }
  return parsed.data;
}

async function persistGeneratedQuiz(params: {
  userId: string;
  sourceType: GenerationSourceType;
  sourceUrl?: string | null;
  input: JobInput;
  generated: Awaited<ReturnType<typeof generateQuizFromPrompt>>;
}) {
  const hubStatus =
    params.input.isHub
      ? "approved"
      : params.input.reviewForHub
        ? "pending"
        : null;

  const [createdQuiz] = await db
    .insert(quizzes)
    .values({
      creatorId: params.userId,
      title: params.generated.title,
      theme: params.generated.theme,
      language: params.input.language,
      difficulty: params.input.difficulty,
      gameMode: params.input.gameMode,
      questionCount: params.generated.questions.length,
      sourceType: mapGenerationSourceToQuizSource(params.sourceType),
      sourceUrl: params.sourceUrl ?? null,
      isHub: params.input.isHub,
      isPublic: params.input.isPublic,
      hubStatus,
    })
    .returning({ id: quizzes.id });

  await db.insert(questions).values(
    params.generated.questions.map((question, index) => ({
      quizId: createdQuiz.id,
      position: index + 1,
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      difficulty: question.difficulty,
      subject: question.subject,
    })),
  );

  return createdQuiz.id;
}

async function applyHubUniqueness(quizId: string, questionTexts: string[]) {
  const embedding = await generateEmbedding(questionTexts);
  const uniqueness = await checkHubUniqueness(embedding, 0.85);

  if (uniqueness.isDuplicate) {
    const similarQuizId = uniqueness.mostSimilarQuizId ?? "unknown";
    const reason = `Too similar to existing hub quiz ${similarQuizId}`;

    await db
      .update(quizzes)
      .set({
        isHub: false,
        hubStatus: null,
        isFlagged: true,
        flagReason: reason,
      })
      .where(eq(quizzes.id, quizId));

    return {
      uniqueness,
      reason,
    };
  }

  await storeQuizEmbedding(quizId, embedding);
  return {
    uniqueness,
    reason: null,
  };
}

async function settleGenerationCharge(params: {
  userId: string;
  jobId: string;
  sourceType: GenerationSourceType;
  billingMode: GenerationBillingMode;
  amountCents: number;
}) {
  if (params.billingMode !== "platform_credits" || params.amountCents <= 0) {
    return { charged: false };
  }

  const deducted = await tryDeductWalletBalanceCents({
    userId: params.userId,
    amountCents: params.amountCents,
  });

  if (!deducted) {
    await db.insert(creditTransactions).values({
      userId: params.userId,
      amountCents: -params.amountCents,
      currency: "usd",
      type: "generation",
      status: "failed",
      description: "Quiz generation charge failed (insufficient balance)",
      generationJobId: params.jobId,
      metadata: {
        sourceType: params.sourceType,
        billingMode: params.billingMode,
        reason: "insufficient_balance",
      },
    });
    return { charged: false };
  }

  await db.insert(creditTransactions).values({
    userId: params.userId,
    amountCents: -params.amountCents,
    currency: "usd",
    type: "generation",
    status: "completed",
    description: "Quiz generation charge",
    generationJobId: params.jobId,
    metadata: {
      sourceType: params.sourceType,
      billingMode: params.billingMode,
    },
  });

  return { charged: true };
}

export const generateQuizTask = task({
  id: "generate-quiz",
  maxDuration: 900,
  run: async (payload: z.infer<typeof taskPayloadSchema>) => {
    const parsedPayload = taskPayloadSchema.parse(payload);
    const job = await loadJob(parsedPayload.jobId);

    if (!job) {
      logger.error("Quiz generation job not found", { jobId: parsedPayload.jobId });
      return { ok: false, error: "job_not_found" };
    }

    let input: JobInput;
    try {
      input = parseInputData(job.inputData);
    } catch (error) {
      const message = toErrorMessage(error);
      await setJobStatus(job.id, { status: "failed", errorMessage: message });
      logger.error("Invalid quiz generation input", { jobId: job.id, error: message });
      return { ok: false, error: message };
    }

    const sourceType = job.sourceType as GenerationSourceType;
    const effectiveInput: JobInput = {
      ...input,
      difficulty: input.gameMode === "wwtbam" ? "escalating" : input.difficulty,
      language: input.language.trim().toLowerCase(),
    };

    await setJobStatus(job.id, { status: "processing", errorMessage: null });

    try {
      if (sourceType === "pdf") {
        throw new Error("PDF generation coming soon");
      }

      const credentials =
        effectiveInput.billingMode === "platform_credits"
          ? (() => {
            if (!process.env.OPENAI_API_KEY) {
              throw new Error("Platform OpenAI key is not configured");
            }
            return {
              provider: "openai" as const,
              apiKey: process.env.OPENAI_API_KEY,
            };
          })()
          : await resolveUserApiKey(job.userId, effectiveInput.apiKeyId);

      if (!credentials) {
        throw new Error("Selected API key not found");
      }

      let effectiveTheme = effectiveInput.theme?.trim() || "General Knowledge";
      let sourceText: string | undefined;
      let sourceUrl: string | null = null;

      if (sourceType === "url") {
        if (!effectiveInput.url) {
          throw new Error("URL source is missing");
        }

        const extracted = await extractArticleText(effectiveInput.url);
        effectiveTheme = effectiveInput.theme?.trim() || extracted.title || effectiveTheme;
        sourceText = extracted.text;
        sourceUrl = effectiveInput.url;
      }

      const model = getLanguageModel(credentials.provider, credentials.apiKey);
      const existingQuestions = await getExistingQuestionsForTheme(effectiveTheme);

      const generated = await generateQuizFromPrompt({
        theme: effectiveTheme,
        gameMode: effectiveInput.gameMode as QuizGenerationGameMode,
        difficulty: effectiveInput.difficulty as QuizGenerationDifficulty,
        model,
        existingQuestions,
        sourceText,
      });

      const quizId = await persistGeneratedQuiz({
        userId: job.userId,
        sourceType,
        sourceUrl,
        input: effectiveInput,
        generated,
      });

      let duplicate = false;
      if (
        effectiveInput.isHub &&
        sourceType === "theme" &&
        isEnglishLanguage(effectiveInput.language)
      ) {
        const uniquenessResult = await applyHubUniqueness(
          quizId,
          generated.questions.map((question) => question.questionText),
        );
        duplicate = uniquenessResult.uniqueness.isDuplicate;
      }

      await setJobStatus(job.id, {
        status: "completed",
        quizId,
        errorMessage: null,
      });

      const settled = await settleGenerationCharge({
        userId: job.userId,
        jobId: job.id,
        sourceType,
        billingMode: effectiveInput.billingMode,
        amountCents: effectiveInput.billingAmountCents,
      });

      logger.log("Quiz generation completed", {
        jobId: job.id,
        quizId,
        sourceType,
        gameMode: effectiveInput.gameMode,
        difficulty: effectiveInput.difficulty,
        provider: credentials.provider,
        duplicate,
        billingMode: effectiveInput.billingMode,
        billedCents: settled.charged ? effectiveInput.billingAmountCents : 0,
      });

      return {
        ok: true,
        jobId: job.id,
        quizId,
        duplicate,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      await setJobStatus(job.id, {
        status: "failed",
        errorMessage: message,
      });

      logger.error("Quiz generation failed", {
        jobId: job.id,
        sourceType,
        error: message,
      });

      return {
        ok: false,
        jobId: job.id,
        error: message,
      };
    }
  },
});
