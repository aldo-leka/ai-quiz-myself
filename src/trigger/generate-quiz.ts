import { eq } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { questions, quizGenerationJobs, quizzes } from "@/db/schema";
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
import { getLanguageModel, resolveUserApiKey } from "@/lib/user-api-keys";

const taskPayloadSchema = z.object({
  jobId: z.string().uuid(),
});

const jobInputSchema = z.object({
  theme: z.string().min(2),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  language: z.string().min(2).default("en"),
  isHub: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  apiKeyId: z.string().uuid(),
});

type JobInput = z.infer<typeof jobInputSchema>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown generation error";
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
      sourceType: "ai_generated",
      isHub: params.input.isHub,
      isPublic: params.input.isPublic,
      hubStatus: params.input.isHub ? "approved" : null,
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

export const generateQuizTask = task({
  id: "admin-generate-quiz",
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

    const effectiveInput: JobInput = {
      ...input,
      difficulty: input.gameMode === "wwtbam" ? "escalating" : input.difficulty,
    };

    await setJobStatus(job.id, { status: "processing", errorMessage: null });

    try {
      const credentials = await resolveUserApiKey(job.userId, effectiveInput.apiKeyId);
      if (!credentials) {
        throw new Error("Selected API key not found");
      }

      const model = getLanguageModel(credentials.provider, credentials.apiKey);
      const existingQuestions = await getExistingQuestionsForTheme(effectiveInput.theme);
      const generated = await generateQuizFromPrompt({
        theme: effectiveInput.theme,
        gameMode: effectiveInput.gameMode as QuizGenerationGameMode,
        difficulty: effectiveInput.difficulty as QuizGenerationDifficulty,
        model,
        temperature: 0.6,
        existingQuestions,
      });

      const quizId = await persistGeneratedQuiz({
        userId: job.userId,
        input: effectiveInput,
        generated,
      });

      const uniquenessResult = await applyHubUniqueness(
        quizId,
        generated.questions.map((question) => question.questionText),
      );

      await setJobStatus(job.id, {
        status: "completed",
        quizId,
        errorMessage: null,
      });

      logger.log("Quiz generation completed", {
        jobId: job.id,
        quizId,
        gameMode: effectiveInput.gameMode,
        difficulty: effectiveInput.difficulty,
        provider: credentials.provider,
        similarity: uniquenessResult.uniqueness.similarity,
        duplicate: uniquenessResult.uniqueness.isDuplicate,
        flaggedReason: uniquenessResult.reason,
      });

      return {
        ok: true,
        jobId: job.id,
        quizId,
        duplicate: uniquenessResult.uniqueness.isDuplicate,
      };
    } catch (error) {
      const message = toErrorMessage(error);
      await setJobStatus(job.id, {
        status: "failed",
        errorMessage: message,
      });

      logger.error("Quiz generation failed", {
        jobId: job.id,
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
