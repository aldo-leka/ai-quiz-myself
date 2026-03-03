import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { and, eq } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys, questions, quizGenerationJobs, quizzes } from "@/db/schema";
import { decryptApiKey } from "@/lib/api-key-crypto";
import {
  generateQuizFromPrompt,
  type QuizGenerationDifficulty,
  type QuizGenerationGameMode,
} from "@/lib/quiz-generation";

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
type ProviderName = "openai" | "anthropic" | "google";

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

async function resolveApiKey(userId: string, apiKeyId: string) {
  const [savedKey] = await db
    .select({
      provider: apiKeys.provider,
      encryptedKey: apiKeys.encryptedKey,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)))
    .limit(1);

  if (!savedKey) {
    throw new Error("Selected API key not found");
  }

  return {
    provider: savedKey.provider as ProviderName,
    apiKey: decryptApiKey(savedKey.encryptedKey),
  };
}

function getModel(provider: ProviderName, apiKey: string) {
  if (provider === "openai") {
    const openai = createOpenAI({ apiKey });
    return openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini");
  }

  if (provider === "anthropic") {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest");
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(process.env.GOOGLE_MODEL ?? "gemini-2.0-flash");
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
      const credentials = await resolveApiKey(job.userId, effectiveInput.apiKeyId);
      const model = getModel(credentials.provider, credentials.apiKey);

      const generated = await generateQuizFromPrompt({
        theme: effectiveInput.theme,
        gameMode: effectiveInput.gameMode as QuizGenerationGameMode,
        difficulty: effectiveInput.difficulty as QuizGenerationDifficulty,
        model,
        temperature: 0.6,
      });

      const quizId = await persistGeneratedQuiz({
        userId: job.userId,
        input: effectiveInput,
        generated,
      });

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
      });

      return {
        ok: true,
        jobId: job.id,
        quizId,
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
