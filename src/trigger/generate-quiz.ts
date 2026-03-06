import { and, eq } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions, hubCandidates, questions, quizGenerationJobs, quizzes } from "@/db/schema";
import type { GenerationBillingMode } from "@/lib/billing";
import { buildHubCandidateSnapshot, createHubCandidate } from "@/lib/hub-candidates";
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
import { getLanguageModel, resolveUserApiKey } from "@/lib/user-api-keys";
import { incrementWalletBalanceCents, tryDeductWalletBalanceCents } from "@/lib/wallet";
import { reviewHubCandidateTask } from "@/trigger/review-hub-candidates";

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
  pdfBase64: z.string().min(1).optional(),
  pdfObjectKey: z.string().min(1).optional(),
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

async function persistGeneratedQuiz(params: {
  userId: string;
  sourceType: GenerationSourceType;
  sourceUrl?: string | null;
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

async function applyHubUniqueness(
  quizId: string,
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
  return {
    uniqueness,
    reason: null,
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
        await clearPdfPayloadFromJob(job.id, effectiveInput);
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

        effectiveTheme = effectiveInput.theme?.trim() || extractedPdf.title || effectiveTheme;
        sourceText = extractedPdf.text;
      } else if (sourceType === "url") {
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
      };
    } catch (error) {
      const message = toErrorMessage(error);
      await setJobStatus(job.id, {
        status: "failed",
        errorMessage: message,
      });

      const refunded = await refundReservedGenerationChargeOnFailure({
        userId: job.userId,
        jobId: job.id,
        sourceType,
        billingMode: effectiveInput.billingMode,
        amountCents: effectiveInput.billingAmountCents,
        errorMessage: message,
      });

      logger.error("Quiz generation failed", {
        jobId: job.id,
        sourceType,
        error: message,
        refundedCharge: refunded.refunded,
      });

      return {
        ok: false,
        jobId: job.id,
        error: message,
      };
    }
  },
});
