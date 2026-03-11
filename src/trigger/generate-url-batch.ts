import { inArray } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { quizGenerationJobs } from "@/db/schema";
import { generateUniqueUrlSubtopics } from "@/lib/url-batch-planning";
import { extractArticleText } from "@/lib/url-extraction";
import {
  failGenerationJob,
  loadGenerationJob,
  parseInputData,
  resolveGenerationCredentials,
  runGenerateQuizJob,
  updateGenerationJobInputData,
  type JobInput,
  type LoadedGenerationJob,
} from "@/trigger/generate-quiz";

const MAX_URL_BATCH_SIZE = 5;

const taskPayloadSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(2).max(MAX_URL_BATCH_SIZE),
});

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown URL batch error";
}

function fallbackTitle(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "") || "Article";
  } catch {
    return "Article";
  }
}

function normalizeOptionalTheme(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

async function loadOrderedJobs(jobIds: string[]): Promise<LoadedGenerationJob[] | null> {
  const rows = await db
    .select({
      id: quizGenerationJobs.id,
    })
    .from(quizGenerationJobs)
    .where(inArray(quizGenerationJobs.id, jobIds));

  if (rows.length !== jobIds.length) {
    return null;
  }

  const loaded = await Promise.all(jobIds.map((jobId) => loadGenerationJob(jobId)));
  if (loaded.some((job) => !job)) {
    return null;
  }

  return loaded.filter((job): job is LoadedGenerationJob => job !== null);
}

async function markBatchFailed(
  jobs: Array<{ job: LoadedGenerationJob; input: JobInput }>,
  errorMessage: string,
) {
  for (const { job, input } of jobs) {
    if (job.status === "completed" && job.quizId) {
      continue;
    }

    await failGenerationJob({
      jobId: job.id,
      userId: job.userId,
      sourceType: "url",
      input,
      errorMessage,
    });
  }
}

export const generateUrlBatchTask = task({
  id: "generate-url-batch",
  maxDuration: 3600,
  run: async (payload: z.infer<typeof taskPayloadSchema>) => {
    const parsedPayload = taskPayloadSchema.parse(payload);
    const jobs = await loadOrderedJobs(parsedPayload.jobIds);

    if (!jobs) {
      logger.error("URL batch generation jobs not found", {
        jobIds: parsedPayload.jobIds,
      });
      return { ok: false, error: "jobs_not_found" };
    }

    const parsedJobs: Array<{ job: LoadedGenerationJob; input: JobInput }> = [];
    for (const job of jobs) {
      try {
        parsedJobs.push({
          job,
          input: parseInputData(job.inputData),
        });
      } catch (error) {
        const message = toErrorMessage(error);
        await db
          .update(quizGenerationJobs)
          .set({
            status: "failed",
            errorMessage: message,
          })
          .where(inArray(quizGenerationJobs.id, [job.id]));
        logger.error("Invalid URL batch job input", { jobId: job.id, error: message });
        return { ok: false, error: message };
      }
    }

    const first = parsedJobs[0];
    if (!first) {
      return { ok: false, error: "empty_batch" };
    }

    const sharedUrl = first.input.url?.trim();
    if (!sharedUrl) {
      const message = "URL batch jobs are missing the source URL";
      await markBatchFailed(parsedJobs, message);
      return { ok: false, error: message };
    }

    const hasMismatchedBatch = parsedJobs.some(
      ({ job, input }) =>
        job.sourceType !== "url" ||
        job.userId !== first.job.userId ||
        input.url?.trim() !== sharedUrl,
    );

    if (hasMismatchedBatch) {
      const message = "URL batch jobs must belong to the same user and source URL";
      await markBatchFailed(parsedJobs, message);
      return { ok: false, error: message };
    }

    let sourceTitle = fallbackTitle(sharedUrl);
    let sourceText = "";
    const lockedThemes = parsedJobs.map(({ input }) => normalizeOptionalTheme(input.theme));
    const existingPlannedThemes = lockedThemes.filter((value): value is string => value !== null);
    let generatedSubtopics: string[] = [];

    try {
      const credentials = await resolveGenerationCredentials(first.job.userId, first.input);
      const extracted = await extractArticleText(sharedUrl);
      sourceTitle = extracted.title?.trim() || sourceTitle;
      sourceText = extracted.text;

      const missingThemeCount = lockedThemes.filter((value) => value === null).length;
      if (missingThemeCount > 0) {
        generatedSubtopics = await generateUniqueUrlSubtopics({
          title: sourceTitle,
          sourceText,
          count: missingThemeCount,
          model: credentials.model,
          existingSubtopics: existingPlannedThemes,
        });
      }
    } catch (error) {
      const message = toErrorMessage(error);
      await markBatchFailed(parsedJobs, message);
      return { ok: false, error: message };
    }

    const plannedThemes = lockedThemes.map((value) => value ?? generatedSubtopics.shift() ?? null);

    const completedJobIds: string[] = [];
    const failedJobs: Array<{ jobId: string; error: string }> = [];
    const accumulatedQuestionTexts: string[] = [];

    for (const [index, entry] of parsedJobs.entries()) {
      const plannedTheme = plannedThemes[index] ?? `${sourceTitle} ${index + 1}`;
      const updatedInput: JobInput = {
        ...entry.input,
        theme: plannedTheme,
        displayTheme: plannedTheme,
        batchIndex: index + 1,
        batchSize: parsedJobs.length,
      };

      try {
        await updateGenerationJobInputData(entry.job.id, updatedInput);
      } catch (error) {
        const message = toErrorMessage(error);
        await failGenerationJob({
          jobId: entry.job.id,
          userId: entry.job.userId,
          sourceType: "url",
          input: updatedInput,
          errorMessage: message,
        });
        failedJobs.push({ jobId: entry.job.id, error: message });
        continue;
      }

      const result = await runGenerateQuizJob({
        jobId: entry.job.id,
        preparedSourceText: sourceText,
        preparedSourceTitle: sourceTitle,
        additionalExistingQuestions: accumulatedQuestionTexts,
      });

      if (result.ok) {
        completedJobIds.push(result.jobId);
        accumulatedQuestionTexts.push(...result.questionTexts);
        continue;
      }

      failedJobs.push({ jobId: result.jobId, error: result.error });
    }

    logger.log("URL batch generation finished", {
      requestedJobs: parsedJobs.length,
      completedJobs: completedJobIds.length,
      failedJobs: failedJobs.length,
      url: sharedUrl,
    });

    return {
      ok: failedJobs.length === 0,
      requestedJobs: parsedJobs.length,
      completedJobIds,
      failedJobs,
    };
  },
});
