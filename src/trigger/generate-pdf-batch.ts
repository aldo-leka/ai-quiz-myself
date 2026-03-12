import { inArray } from "drizzle-orm";
import { logger, task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { db } from "@/db";
import { quizGenerationJobs } from "@/db/schema";
import {
  allocateSharedCostBreakdown,
  createGenerationCostBreakdown,
  createGenerationCostLineItem,
  mergeGenerationCostBreakdowns,
} from "@/lib/ai-pricing";
import { extractPdfSourceText } from "@/lib/pdf-extraction";
import { downloadR2ObjectBuffer } from "@/lib/r2";
import { generateUniqueSourceSubtopics } from "@/lib/url-batch-planning";
import {
  failGenerationJob,
  loadGenerationJob,
  parseInputData,
  resolveGenerationCredentials,
  runGenerateQuizJob,
  updateGenerationJobCostBreakdown,
  updateGenerationJobInputData,
  type JobInput,
  type LoadedGenerationJob,
} from "@/trigger/generate-quiz";

const MAX_PDF_BATCH_SIZE = 3;

const taskPayloadSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(2).max(MAX_PDF_BATCH_SIZE),
});

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return "Unknown PDF batch error";
}

function normalizeOptionalTheme(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function fallbackTitle(fileName: string | undefined): string {
  const normalized = fileName?.replace(/\.pdf$/i, "").trim();
  return normalized && normalized.length > 0 ? normalized : "PDF Quiz";
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
      sourceType: "pdf",
      input,
      errorMessage,
    });
  }
}

export const generatePdfBatchTask = task({
  id: "generate-pdf-batch",
  maxDuration: 3600,
  run: async (payload: z.infer<typeof taskPayloadSchema>) => {
    const parsedPayload = taskPayloadSchema.parse(payload);
    const jobs = await loadOrderedJobs(parsedPayload.jobIds);

    if (!jobs) {
      logger.error("PDF batch generation jobs not found", {
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
        logger.error("Invalid PDF batch job input", { jobId: job.id, error: message });
        return { ok: false, error: message };
      }
    }

    const first = parsedJobs[0];
    if (!first) {
      return { ok: false, error: "empty_batch" };
    }

    const sharedObjectKey = first.input.pdfObjectKey?.trim();
    const sharedFileName = first.input.fileName?.trim();

    if (!sharedObjectKey) {
      const message = "PDF batch jobs are missing the uploaded PDF object key";
      await markBatchFailed(parsedJobs, message);
      return { ok: false, error: message };
    }

    const hasMismatchedBatch = parsedJobs.some(
      ({ job, input }) =>
        job.sourceType !== "pdf" ||
        job.userId !== first.job.userId ||
        input.pdfObjectKey?.trim() !== sharedObjectKey ||
        input.fileName?.trim() !== sharedFileName,
    );

    if (hasMismatchedBatch) {
      const message = "PDF batch jobs must belong to the same user and uploaded PDF";
      await markBatchFailed(parsedJobs, message);
      return { ok: false, error: message };
    }

    let sourceTitle = fallbackTitle(sharedFileName);
    let sourceText = "";
    const lockedThemes = parsedJobs.map(({ input }) => normalizeOptionalTheme(input.theme));
    const existingPlannedThemes = lockedThemes.filter((value): value is string => value !== null);
    let generatedSubtopics: string[] = [];
    let sharedCostBreakdowns = parsedJobs.map(() => createGenerationCostBreakdown([]));

    try {
      const credentials = await resolveGenerationCredentials(first.job.userId, first.input);
      const pdfBuffer = await downloadR2ObjectBuffer(sharedObjectKey);
      if (!pdfBuffer.length) {
        throw new Error("Uploaded PDF is empty");
      }

      const extracted = await extractPdfSourceText({
        pdfBuffer,
        fileName: sharedFileName ?? "uploaded.pdf",
        openAIApiKey: process.env.OPENAI_API_KEY,
      });

      sourceTitle = extracted.title || sourceTitle;
      sourceText = extracted.text;

      if (extracted.costLineItem) {
        sharedCostBreakdowns = allocateSharedCostBreakdown(
          mergeGenerationCostBreakdowns(
            createGenerationCostBreakdown([]),
            createGenerationCostBreakdown([extracted.costLineItem]),
          ),
          parsedJobs.length,
        );
      }

      const missingThemeCount = lockedThemes.filter((value) => value === null).length;
      if (missingThemeCount > 0) {
        const generatedSubtopicsResult = await generateUniqueSourceSubtopics({
          title: sourceTitle,
          sourceText,
          count: missingThemeCount,
          model: credentials.model,
          existingSubtopics: existingPlannedThemes,
        });
        generatedSubtopics = generatedSubtopicsResult.subtopics;

        const planningBreakdowns = allocateSharedCostBreakdown(
          createGenerationCostBreakdown([
            createGenerationCostLineItem({
              kind: "source_subtopic_planning",
              provider: credentials.provider,
              model: credentials.modelName,
              usage: generatedSubtopicsResult.usage,
            }),
          ]),
          parsedJobs.length,
        );

        sharedCostBreakdowns = sharedCostBreakdowns.map((breakdown, index) =>
          mergeGenerationCostBreakdowns(breakdown, planningBreakdowns[index]),
        );
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
        await updateGenerationJobCostBreakdown(
          entry.job.id,
          mergeGenerationCostBreakdowns(
            entry.job.generationCostBreakdown,
            sharedCostBreakdowns[index],
          ),
        );
      } catch (error) {
        const message = toErrorMessage(error);
        await failGenerationJob({
          jobId: entry.job.id,
          userId: entry.job.userId,
          sourceType: "pdf",
          input: updatedInput,
          errorMessage: message,
          generationCostBreakdown: mergeGenerationCostBreakdowns(
            entry.job.generationCostBreakdown,
            sharedCostBreakdowns[index],
          ),
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

    logger.log("PDF batch generation finished", {
      requestedJobs: parsedJobs.length,
      completedJobs: completedJobIds.length,
      failedJobs: failedJobs.length,
      fileName: sharedFileName,
    });

    return {
      ok: failedJobs.length === 0,
      requestedJobs: parsedJobs.length,
      completedJobIds,
      failedJobs,
    };
  },
});
