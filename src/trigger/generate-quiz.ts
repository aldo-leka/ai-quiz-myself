import { and, eq } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions, hubCandidates, questions, quizGenerationJobs, quizzes } from "@/db/schema";
import type { GenerationBillingMode } from "@/lib/billing";
import { buildHubCandidateSnapshot, createHubCandidate } from "@/lib/hub-candidates";
import { upsertHubThemeEmbedding } from "@/lib/hub-theme-embeddings";
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
import { extractPdfSourceText } from "@/lib/pdf-extraction";
import { downloadR2ObjectBuffer } from "@/lib/r2";
import { extractArticleText } from "@/lib/url-extraction";
import { getLanguageModel, getLanguageModelName, resolveUserApiKey } from "@/lib/user-api-keys";
import { incrementWalletBalanceCents, tryDeductWalletBalanceCents } from "@/lib/wallet";
import { reviewHubCandidateTask } from "@/trigger/review-hub-candidates";

const taskPayloadSchema = z.object({
  jobId: z.string().uuid(),
});

const jobInputSchema = z.object({
  theme: z.string().min(2).optional(),
  displayTheme: z.string().min(2).optional(),
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
  pdfBase64: z.string().min(1).optional(),
  pdfObjectKey: z.string().min(1).optional(),
  batchIndex: z.number().int().positive().optional(),
  batchSize: z.number().int().positive().optional(),
});

export type GenerationSourceType = "theme" | "url" | "pdf";
export type JobInput = z.infer<typeof jobInputSchema>;
export type LoadedGenerationJob = {
  id: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  quizId: string | null;
  sourceType: GenerationSourceType;
  inputData: unknown;
};
type ResolvedGenerationCredentials = {
  provider: "openai" | "anthropic" | "google";
  apiKey: string;
  modelName: string;
  model: ReturnType<typeof getLanguageModel>;
};
type RunGenerateQuizJobResult =
  | {
    ok: true;
    jobId: string;
    quizId: string;
    duplicate: boolean;
    hubCandidateId: string | null;
    questionTexts: string[];
  }
  | {
    ok: false;
    jobId: string;
    error: string;
  };

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

export async function loadGenerationJob(jobId: string): Promise<LoadedGenerationJob | null> {
  const [job] = await db
    .select({
      id: quizGenerationJobs.id,
      userId: quizGenerationJobs.userId,
      status: quizGenerationJobs.status,
      quizId: quizGenerationJobs.quizId,
      sourceType: quizGenerationJobs.sourceType,
      inputData: quizGenerationJobs.inputData,
    })
    .from(quizGenerationJobs)
    .where(eq(quizGenerationJobs.id, jobId))
    .limit(1);

  return job ?? null;
}

export function parseInputData(inputData: unknown): JobInput {
  const parsed = jobInputSchema.safeParse(inputData);
  if (!parsed.success) {
    throw new Error("Invalid quiz generation payload");
  }
  return parsed.data;
}

async function clearPdfPayloadFromJob(jobId: string, input: JobInput) {
  if (!input.pdfBase64) return;

  const rest = { ...input };
  delete rest.pdfBase64;
  await db
    .update(quizGenerationJobs)
    .set({
      inputData: rest,
    })
    .where(eq(quizGenerationJobs.id, jobId));
}

export async function updateGenerationJobInputData(jobId: string, input: JobInput) {
  await db
    .update(quizGenerationJobs)
    .set({
      inputData: input,
    })
    .where(eq(quizGenerationJobs.id, jobId));
}

async function persistGeneratedQuiz(params: {
  userId: string;
  sourceType: GenerationSourceType;
  sourceUrl?: string | null;
  provider: "openai" | "anthropic" | "google";
  modelName: string;
  input: JobInput;
  generated: Awaited<ReturnType<typeof generateQuizFromPrompt>>;
}) {
  const [createdQuiz] = await db
    .insert(quizzes)
    .values({
      creatorId: params.userId,
      title: params.generated.title,
      theme: params.generated.theme,
      language: params.input.language,
      difficulty: params.input.difficulty,
      gameMode: params.input.gameMode,
      generationProvider: params.provider,
      generationModel: params.modelName,
      questionCount: params.generated.questions.length,
      sourceType: mapGenerationSourceToQuizSource(params.sourceType),
      sourceUrl: params.sourceUrl ?? null,
      isHub: params.input.isHub,
      isPublic: params.input.isPublic,
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

async function getQuestionTextsForQuiz(quizId: string): Promise<string[]> {
  const rows = await db
    .select({
      questionText: questions.questionText,
    })
    .from(questions)
    .where(eq(questions.quizId, quizId));

  return rows
    .map((row) => row.questionText.trim())
    .filter((question) => question.length > 0);
}

async function applyHubUniqueness(
  quizId: string,
  theme: string,
  questionTexts: string[],
  gameMode: "single" | "wwtbam" | "couch_coop",
) {
  const embedding = await generateEmbedding(questionTexts);
  const uniqueness = await checkHubUniqueness(embedding, gameMode, 0.85);

  if (uniqueness.isDuplicate) {
    const similarQuizId = uniqueness.mostSimilarQuizId ?? "unknown";
    const reason = `Too similar to existing hub quiz ${similarQuizId}`;

    await db
      .update(quizzes)
      .set({
        isHub: false,
      })
      .where(eq(quizzes.id, quizId));

    return {
      uniqueness,
      reason,
    };
  }

  await storeQuizEmbedding(quizId, embedding);
  await upsertHubThemeEmbedding({
    quizId,
    theme,
    gameMode,
  });
  return {
    uniqueness,
    reason: null,
  };
}

function mergeExistingQuestions(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const group of groups) {
    for (const value of group ?? []) {
      const question = value.trim();
      if (!question) continue;
      const key = question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(question);
    }
  }

  return merged;
}

export async function resolveGenerationCredentials(
  userId: string,
  input: JobInput,
): Promise<ResolvedGenerationCredentials> {
  const credentials =
    input.billingMode === "platform_credits"
      ? (() => {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error("Platform OpenAI key is not configured");
        }
        return {
          provider: "openai" as const,
          apiKey: process.env.OPENAI_API_KEY,
        };
      })()
      : await resolveUserApiKey(userId, input.apiKeyId);

  if (!credentials) {
    throw new Error("Selected API key not found");
  }

  const modelName = getLanguageModelName(credentials.provider);

  return {
    provider: credentials.provider,
    apiKey: credentials.apiKey,
    modelName,
    model: getLanguageModel(credentials.provider, credentials.apiKey),
  };
}

async function settleGenerationChargeOnSuccess(params: {
  userId: string;
  jobId: string;
  sourceType: GenerationSourceType;
  billingMode: GenerationBillingMode;
  amountCents: number;
}) {
  if (params.billingMode !== "platform_credits" || params.amountCents <= 0) {
    return { charged: false };
  }

  const [reservedTransaction] = await db
    .select({
      id: creditTransactions.id,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, params.userId),
        eq(creditTransactions.generationJobId, params.jobId),
        eq(creditTransactions.type, "generation"),
        eq(creditTransactions.status, "pending"),
      ),
    )
    .limit(1);

  if (reservedTransaction) {
    await db
      .update(creditTransactions)
      .set({
        status: "completed",
        description: "Quiz generation charge",
        metadata: {
          sourceType: params.sourceType,
          billingMode: params.billingMode,
          reason: "settled_after_success",
        },
      })
      .where(eq(creditTransactions.id, reservedTransaction.id));

    return { charged: true };
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

async function refundReservedGenerationChargeOnFailure(params: {
  userId: string;
  jobId: string;
  sourceType: GenerationSourceType;
  billingMode: GenerationBillingMode;
  amountCents: number;
  errorMessage: string;
}) {
  if (params.billingMode !== "platform_credits" || params.amountCents <= 0) {
    return { refunded: false };
  }

  const [reservedTransaction] = await db
    .select({
      id: creditTransactions.id,
      amountCents: creditTransactions.amountCents,
    })
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.userId, params.userId),
        eq(creditTransactions.generationJobId, params.jobId),
        eq(creditTransactions.type, "generation"),
        eq(creditTransactions.status, "pending"),
      ),
    )
    .limit(1);

  if (!reservedTransaction) {
    return { refunded: false };
  }

  await incrementWalletBalanceCents(
    params.userId,
    Math.abs(Number(reservedTransaction.amountCents)),
  );

  await db
    .update(creditTransactions)
    .set({
      status: "failed",
      description: "Quiz generation charge refunded (generation failed)",
      metadata: {
        sourceType: params.sourceType,
        billingMode: params.billingMode,
        reason: "generation_failed_refund",
        error: params.errorMessage.slice(0, 500),
      },
    })
    .where(eq(creditTransactions.id, reservedTransaction.id));

  return { refunded: true };
}

export async function failGenerationJob(params: {
  jobId: string;
  userId: string;
  sourceType: GenerationSourceType;
  input: JobInput;
  errorMessage: string;
}) {
  await setJobStatus(params.jobId, {
    status: "failed",
    errorMessage: params.errorMessage,
  });

  const refunded = await refundReservedGenerationChargeOnFailure({
    userId: params.userId,
    jobId: params.jobId,
    sourceType: params.sourceType,
    billingMode: params.input.billingMode,
    amountCents: params.input.billingAmountCents,
    errorMessage: params.errorMessage,
  });

  logger.error("Quiz generation failed", {
    jobId: params.jobId,
    sourceType: params.sourceType,
    error: params.errorMessage,
    refundedCharge: refunded.refunded,
  });

  return {
    ok: false as const,
    jobId: params.jobId,
    error: params.errorMessage,
  };
}

export async function runGenerateQuizJob(params: {
  jobId: string;
  preparedSourceText?: string;
  preparedSourceTitle?: string;
  additionalExistingQuestions?: string[];
}): Promise<RunGenerateQuizJobResult> {
  const job = await loadGenerationJob(params.jobId);

  if (!job) {
    logger.error("Quiz generation job not found", { jobId: params.jobId });
    return { ok: false, jobId: params.jobId, error: "job_not_found" };
  }

  let input: JobInput;
  try {
    input = parseInputData(job.inputData);
  } catch (error) {
    const message = toErrorMessage(error);
    await setJobStatus(job.id, { status: "failed", errorMessage: message });
    logger.error("Invalid quiz generation input", { jobId: job.id, error: message });
    return { ok: false, jobId: job.id, error: message };
  }

  if (job.status === "completed" && job.quizId) {
    logger.log("Skipping already completed quiz generation job", {
      jobId: job.id,
      quizId: job.quizId,
    });

    return {
      ok: true,
      jobId: job.id,
      quizId: job.quizId,
      duplicate: false,
      hubCandidateId: null,
      questionTexts: await getQuestionTextsForQuiz(job.quizId),
    };
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
      await clearPdfPayloadFromJob(job.id, effectiveInput);
    }

    const credentials = await resolveGenerationCredentials(job.userId, effectiveInput);

    let effectiveTheme = effectiveInput.theme?.trim() || "General Knowledge";
    let sourceText: string | undefined;
    let sourceUrl: string | null = null;

    if (sourceType === "pdf") {
      if (!effectiveInput.pdfBase64 && !effectiveInput.pdfObjectKey) {
        throw new Error("PDF source payload is missing");
      }

      const pdfBuffer = effectiveInput.pdfObjectKey
        ? await downloadR2ObjectBuffer(effectiveInput.pdfObjectKey)
        : Buffer.from(effectiveInput.pdfBase64 ?? "", "base64");
      if (!pdfBuffer.length) {
        throw new Error("Uploaded PDF is empty");
      }

      const extractedPdf = await extractPdfSourceText({
        pdfBuffer,
        fileName: effectiveInput.fileName ?? "uploaded.pdf",
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

      effectiveTheme =
        effectiveInput.theme?.trim() || extractedPdf.title || params.preparedSourceTitle || effectiveTheme;
      sourceText = extractedPdf.text;
    } else if (sourceType === "url") {
      if (!effectiveInput.url) {
        throw new Error("URL source is missing");
      }

      if (params.preparedSourceText) {
        effectiveTheme =
          effectiveInput.theme?.trim() ||
          params.preparedSourceTitle?.trim() ||
          effectiveTheme;
        sourceText = params.preparedSourceText;
      } else {
        const extracted = await extractArticleText(effectiveInput.url);
        effectiveTheme = effectiveInput.theme?.trim() || extracted.title || effectiveTheme;
        sourceText = extracted.text;
      }

      sourceUrl = effectiveInput.url;
    }

    const existingQuestions = mergeExistingQuestions(
      await getExistingQuestionsForTheme(effectiveTheme),
      params.additionalExistingQuestions,
    );

    const generated = await generateQuizFromPrompt({
      theme: effectiveTheme,
      gameMode: effectiveInput.gameMode as QuizGenerationGameMode,
      difficulty: effectiveInput.difficulty as QuizGenerationDifficulty,
      model: credentials.model,
      existingQuestions,
      sourceText,
    });

    const quizId = await persistGeneratedQuiz({
      userId: job.userId,
      sourceType,
      sourceUrl,
      provider: credentials.provider,
      modelName: credentials.modelName,
      input: effectiveInput,
      generated,
    });

    const questionTexts = generated.questions.map((question) => question.questionText);
    let duplicate = false;
    if (
      effectiveInput.isHub &&
      sourceType === "theme" &&
      isEnglishLanguage(effectiveInput.language)
    ) {
      const uniquenessResult = await applyHubUniqueness(
        quizId,
        generated.theme,
        questionTexts,
        effectiveInput.gameMode,
      );
      duplicate = uniquenessResult.uniqueness.isDuplicate;
    }

    await setJobStatus(job.id, {
      status: "completed",
      quizId,
      errorMessage: null,
    });

    let hubCandidateId: string | null = null;
    if (
      !effectiveInput.isHub &&
      effectiveInput.reviewForHub &&
      isEnglishLanguage(effectiveInput.language) &&
      (sourceType === "theme" || sourceType === "url")
    ) {
      try {
        const snapshot = buildHubCandidateSnapshot({
          generated,
          language: effectiveInput.language,
          difficulty: effectiveInput.difficulty,
          gameMode: effectiveInput.gameMode,
          generationProvider: credentials.provider,
          generationModel: credentials.modelName,
          sourceType: mapGenerationSourceToQuizSource(sourceType),
          sourceUrl,
        });

        const candidate = await createHubCandidate({
          sourceQuizId: quizId,
          submittedByUserId: job.userId,
          snapshot,
        });

        hubCandidateId = candidate.id;

        try {
          await reviewHubCandidateTask.trigger({
            candidateId: candidate.id,
          });
        } catch (reviewTriggerError) {
          const message = toErrorMessage(reviewTriggerError);
          await db
            .update(hubCandidates)
            .set({
              status: "failed",
              reviewReason: `Failed to enqueue hub review: ${message}`.slice(0, 500),
              reviewedAt: new Date(),
            })
            .where(eq(hubCandidates.id, candidate.id));
          logger.error("Failed to enqueue hub candidate review", {
            jobId: job.id,
            quizId,
            candidateId: candidate.id,
            error: message,
          });
        }
      } catch (candidateError) {
        logger.error("Failed creating hub candidate snapshot", {
          jobId: job.id,
          quizId,
          error: toErrorMessage(candidateError),
        });
      }
    }

    const settled = await settleGenerationChargeOnSuccess({
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
      hubCandidateId,
      billingMode: effectiveInput.billingMode,
      billedCents: settled.charged ? effectiveInput.billingAmountCents : 0,
    });

    return {
      ok: true,
      jobId: job.id,
      quizId,
      duplicate,
      hubCandidateId,
      questionTexts,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    return failGenerationJob({
      jobId: job.id,
      userId: job.userId,
      sourceType,
      input: effectiveInput,
      errorMessage: message,
    });
  }
}

export const generateQuizTask = task({
  id: "generate-quiz",
  maxDuration: 900,
  run: async (payload: z.infer<typeof taskPayloadSchema>) => {
    const parsedPayload = taskPayloadSchema.parse(payload);
    const result = await runGenerateQuizJob({
      jobId: parsedPayload.jobId,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      jobId: result.jobId,
      quizId: result.quizId,
      duplicate: result.duplicate,
      hubCandidateId: result.hubCandidateId,
    };
  },
});
