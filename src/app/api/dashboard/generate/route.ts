import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions, credits, platformSettings, quizGenerationJobs } from "@/db/schema";
import { user } from "@/db/schema/auth";
import {
  LEGACY_AI_GENERATION_COST_SETTING_KEY,
  LEGACY_PDF_GENERATION_COST_SETTING_KEY,
  QUIZ_GENERATION_COST_SETTING_KEY,
  resolveGenerationCostCentsFromSettings,
  type GenerationBillingMode,
} from "@/lib/billing";
import { isR2Configured } from "@/lib/r2";
import { getUserSessionOrNull } from "@/lib/user-auth";
import { resolveUserApiKey, type ProviderName } from "@/lib/user-api-keys";
import { incrementWalletBalanceCents, tryDeductWalletBalanceCents } from "@/lib/wallet";
import { generatePdfBatchTask } from "@/trigger/generate-pdf-batch";
import { generateQuizTask } from "@/trigger/generate-quiz";
import { generateUrlBatchTask } from "@/trigger/generate-url-batch";

export const runtime = "nodejs";

const MAX_BATCH_COUNTS = {
  theme: 100,
  url: 5,
  pdf: 3,
} as const;

const requestSchema = z.object({
  sourceType: z.enum(["theme", "url", "pdf"]),
  theme: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(2).max(140).optional(),
  ),
  themes: z
    .array(
      z.preprocess(
        (value) => (typeof value === "string" ? value.trim() : value),
        z.string().min(2).max(140),
      ),
    )
    .max(MAX_BATCH_COUNTS.theme)
    .optional(),
  url: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().url().optional(),
  ),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  language: z.string().trim().min(2).max(16).default("en"),
  quantity: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length > 0) {
        return Number.parseInt(value, 10);
      }
      return value;
    },
    z.number().int().min(1).max(MAX_BATCH_COUNTS.theme).default(1),
  ),
  billingMode: z.enum(["byok", "platform_credits"]).optional(),
  apiKeyId: z.string().uuid().optional(),
  fileName: z.string().trim().min(1).max(220).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
  pdfObjectKey: z.string().trim().min(1).max(500).optional(),
});

type ParsedGenerateRequest = {
  sourceType: "theme" | "url" | "pdf";
  theme?: string;
  themes?: string[];
  url?: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  language: string;
  quantity: number;
  billingMode?: "byok" | "platform_credits";
  apiKeyId?: string;
  fileName?: string;
  fileSizeBytes?: number;
  pdfObjectKey?: string;
};

type GenerationRequestItem = {
  theme?: string;
  url?: string;
  displayTheme: string;
  batchIndex: number;
  batchSize: number;
};

function normalizePreferredProvider(value: string | null | undefined): ProviderName | null {
  if (value === "openai" || value === "anthropic" || value === "google") {
    return value;
  }
  return null;
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeThemeEntries(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length < 2) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function hostnameForUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./, "") || "URL Quiz";
  } catch {
    return "URL Quiz";
  }
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, "").trim() || "PDF Quiz";
}

function maxBatchCountForPayload(payload: ParsedGenerateRequest): number {
  return MAX_BATCH_COUNTS[payload.sourceType];
}

function buildGenerationItems(payload: ParsedGenerateRequest): {
  items: GenerationRequestItem[];
  error?: { status: number; message: string };
} {
  const quantity = payload.quantity;

  if (payload.sourceType === "theme") {
    const normalizedThemes = normalizeThemeEntries(
      [payload.theme, ...(payload.themes ?? [])].filter(
        (value): value is string => typeof value === "string",
      ),
    );

    if (quantity === 1) {
      const singleTheme = normalizedThemes[0];
      if (!singleTheme) {
        return {
          items: [],
          error: {
            status: 400,
            message: "Theme is required for this generation mode.",
          },
        };
      }

      return {
        items: [
          {
            theme: singleTheme,
            displayTheme: singleTheme,
            batchIndex: 1,
            batchSize: 1,
          },
        ],
      };
    }

    if (normalizedThemes.length < quantity) {
      return {
        items: [],
        error: {
          status: 400,
          message: `Provide at least ${quantity} distinct themes for a theme batch.`,
        },
      };
    }

    return {
      items: normalizedThemes.slice(0, quantity).map((theme, index) => ({
        theme,
        displayTheme: theme,
        batchIndex: index + 1,
        batchSize: quantity,
      })),
    };
  }

  if (payload.sourceType === "url") {
    if (!payload.url) {
      return {
        items: [],
        error: {
          status: 400,
          message: "URL is required for this generation mode.",
        },
      };
    }

    const baseLabel = hostnameForUrl(payload.url);
    return {
      items: Array.from({ length: quantity }, (_, index) => ({
        url: payload.url!,
        displayTheme: quantity > 1 ? `${baseLabel} #${index + 1}` : baseLabel,
        batchIndex: index + 1,
        batchSize: quantity,
      })),
    };
  }

  if (!payload.fileName || !payload.pdfObjectKey) {
    return {
      items: [],
      error: {
        status: 400,
        message: "PDF upload is required for this generation mode.",
      },
    };
  }

  const baseLabel = fileBaseName(payload.fileName);
  return {
    items: Array.from({ length: quantity }, (_, index) => ({
      displayTheme: quantity > 1 ? `${baseLabel} #${index + 1}` : baseLabel,
      batchIndex: index + 1,
      batchSize: quantity,
    })),
  };
}

async function parseGenerateRequest(request: Request): Promise<{
  payload: ParsedGenerateRequest;
  error?: { status: number; message: string; issues?: unknown };
}> {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return {
      payload: {
        sourceType: "theme",
        gameMode: "single",
        difficulty: "mixed",
        language: "en",
        quantity: 1,
      },
      error: {
        status: 400,
        message: "Invalid payload",
        issues: parsed.error.issues,
      },
    };
  }

  return {
    payload: parsed.data,
  };
}

function resolveBillingMode(params: {
  sourceType: "theme" | "url" | "pdf";
  requestedBillingMode: GenerationBillingMode | undefined;
  hasSufficientCredits: boolean;
  platformBillingAvailable: boolean;
}): GenerationBillingMode {
  if (params.sourceType === "pdf") {
    return "platform_credits";
  }

  if (params.requestedBillingMode) {
    return params.requestedBillingMode;
  }

  if (params.platformBillingAvailable && params.hasSufficientCredits) {
    return "platform_credits";
  }

  return "byok";
}

async function failJobStart(params: {
  userId: string;
  jobId: string;
  sourceType: "theme" | "url" | "pdf";
  billingMode: GenerationBillingMode;
  amountCents: number;
  batchIndex: number;
  batchSize: number;
  errorMessage: string;
}) {
  await db
    .update(quizGenerationJobs)
    .set({
      status: "failed",
      errorMessage: params.errorMessage.slice(0, 500),
    })
    .where(eq(quizGenerationJobs.id, params.jobId));

  if (params.billingMode !== "platform_credits" || params.amountCents <= 0) {
    return;
  }

  await incrementWalletBalanceCents(params.userId, params.amountCents);
  await db
    .update(creditTransactions)
    .set({
      status: "failed",
      description: "Quiz generation charge refunded (task start failed)",
      metadata: {
        sourceType: params.sourceType,
        billingMode: params.billingMode,
        reason: "task_start_failed_refund",
        batchIndex: params.batchIndex,
        batchSize: params.batchSize,
      },
    })
    .where(eq(creditTransactions.generationJobId, params.jobId));
}

export async function POST(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedRequest = await parseGenerateRequest(request);
  if (parsedRequest.error) {
    return NextResponse.json(
      { error: parsedRequest.error.message, issues: parsedRequest.error.issues },
      { status: parsedRequest.error.status },
    );
  }

  const payload = parsedRequest.payload;
  const normalizedLanguage = normalizeLanguage(payload.language);
  const effectiveDifficulty =
    payload.gameMode === "wwtbam" ? "escalating" : payload.difficulty;
  const platformBillingAvailable = Boolean(process.env.OPENAI_API_KEY);
  const maxBatchCount = maxBatchCountForPayload(payload);

  if (payload.quantity > maxBatchCount) {
    if (payload.sourceType === "pdf") {
      return NextResponse.json(
        {
          error: `PDF batch generation currently supports up to ${maxBatchCount} quizzes per batch.`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: `You can generate at most ${maxBatchCount} quizzes from ${payload.sourceType.toUpperCase()} at once.`,
      },
      { status: 400 },
    );
  }

  const generationItemsResult = buildGenerationItems(payload);
  if (generationItemsResult.error) {
    return NextResponse.json(
      { error: generationItemsResult.error.message },
      { status: generationItemsResult.error.status },
    );
  }

  const generationItems = generationItemsResult.items;
  const requestedCount = generationItems.length;

  const [userRows, settingRows, walletRows] = await Promise.all([
    db
      .select({
        preferredProvider: user.preferredProvider,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1),
    db
      .select({
        key: platformSettings.key,
        value: platformSettings.value,
      })
      .from(platformSettings)
      .where(
        inArray(platformSettings.key, [
          QUIZ_GENERATION_COST_SETTING_KEY,
          LEGACY_AI_GENERATION_COST_SETTING_KEY,
          LEGACY_PDF_GENERATION_COST_SETTING_KEY,
        ]),
      )
      .limit(3),
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, session.user.id))
      .limit(1),
  ]);

  const userRow = userRows[0];
  const generationCostCents = resolveGenerationCostCentsFromSettings(settingRows);
  const walletBalanceCents = Number(walletRows[0]?.balanceCents ?? 0);

  const billingMode = resolveBillingMode({
    sourceType: payload.sourceType,
    requestedBillingMode: payload.billingMode,
    hasSufficientCredits: walletBalanceCents >= generationCostCents,
    platformBillingAvailable,
  });

  if (payload.sourceType === "pdf" && payload.pdfObjectKey && !isR2Configured()) {
    return NextResponse.json(
      { error: "R2 is not configured for async PDF processing." },
      { status: 412 },
    );
  }

  let provider: ProviderName = "openai";
  let resolvedApiKeyId: string | undefined;

  if (payload.sourceType === "pdf" && billingMode !== "platform_credits") {
    return NextResponse.json(
      { error: "PDF generation requires platform credits mode." },
      { status: 400 },
    );
  }

  if (billingMode === "platform_credits") {
    if (!platformBillingAvailable) {
      return NextResponse.json(
        { error: "Platform OpenAI key is not configured for credits billing." },
        { status: 412 },
      );
    }

    if (walletBalanceCents < generationCostCents) {
      return NextResponse.json(
        {
          error: "Insufficient balance for this generation.",
          balanceCents: walletBalanceCents,
          requiredCents: generationCostCents,
          requestedCount,
          schedulableCount: 0,
        },
        { status: 402 },
      );
    }

    provider = "openai";
  } else {
    if (payload.sourceType === "pdf") {
      return NextResponse.json(
        { error: "PDF generation currently requires platform credits." },
        { status: 400 },
      );
    }

    const preferredProvider = normalizePreferredProvider(userRow?.preferredProvider);
    const selectedKey = await resolveUserApiKey(
      session.user.id,
      payload.apiKeyId,
      preferredProvider,
    );

    if (!selectedKey) {
      return NextResponse.json(
        { error: "No API key found. Add one in Settings." },
        { status: 412 },
      );
    }

    provider = selectedKey.provider;
    resolvedApiKeyId = selectedKey.id;
  }

  const affordableCount =
    billingMode === "platform_credits" && generationCostCents > 0
      ? Math.floor(walletBalanceCents / generationCostCents)
      : requestedCount;
  const maxScheduledCount =
    billingMode === "platform_credits"
      ? Math.min(requestedCount, affordableCount)
      : requestedCount;

  if (billingMode === "platform_credits" && maxScheduledCount <= 0) {
    return NextResponse.json(
      {
        error: "Insufficient balance for this generation.",
        balanceCents: walletBalanceCents,
        requiredCents: generationCostCents,
        requestedCount,
        schedulableCount: 0,
      },
      { status: 402 },
    );
  }

  const itemsToSchedule = generationItems.slice(0, maxScheduledCount);
  const shouldUseUrlBatchPlanner = payload.sourceType === "url" && itemsToSchedule.length > 1;
  const shouldUsePdfBatchPlanner = payload.sourceType === "pdf" && itemsToSchedule.length > 1;
  const scheduledJobIds: string[] = [];
  const triggerRunIds: string[] = [];
  const warnings: string[] = [];
  let remainingAffordableCount = maxScheduledCount;
  let balanceChangedDuringScheduling = false;

  for (const item of itemsToSchedule) {
    const [job] = await db
      .insert(quizGenerationJobs)
      .values({
        userId: session.user.id,
        status: "pending",
        sourceType: payload.sourceType,
        inputData: {
          theme: item.theme,
          displayTheme: item.displayTheme,
          url: item.url,
          gameMode: payload.gameMode,
          difficulty: effectiveDifficulty,
          language: normalizedLanguage,
          isHub: false,
          reviewForHub: payload.sourceType === "theme" || payload.sourceType === "url",
          isPublic: true,
          apiKeyId: resolvedApiKeyId,
          billingMode,
          billingAmountCents: billingMode === "platform_credits" ? generationCostCents : 0,
          fileName: payload.fileName,
          fileSizeBytes: payload.fileSizeBytes,
          pdfObjectKey: payload.pdfObjectKey,
          batchIndex: item.batchIndex,
          batchSize: item.batchSize,
        },
        provider,
        errorMessage: null,
      })
      .returning({
        id: quizGenerationJobs.id,
      });

    let reservedCharge = false;

    if (billingMode === "platform_credits" && generationCostCents > 0) {
      const deducted = await tryDeductWalletBalanceCents({
        userId: session.user.id,
        amountCents: generationCostCents,
      });

      if (!deducted) {
        await db.delete(quizGenerationJobs).where(eq(quizGenerationJobs.id, job.id));
        balanceChangedDuringScheduling = true;
        warnings.push("Balance changed before all requested quizzes could be scheduled.");
        break;
      }

      try {
        await db.insert(creditTransactions).values({
          userId: session.user.id,
          amountCents: -generationCostCents,
          currency: "usd",
          type: "generation",
          status: "pending",
          description: "Quiz generation charge (reserved)",
          generationJobId: job.id,
          metadata: {
            sourceType: payload.sourceType,
            billingMode,
            reason: "reserved_on_start",
            batchIndex: item.batchIndex,
            batchSize: item.batchSize,
          },
        });
        reservedCharge = true;
        remainingAffordableCount -= 1;
      } catch {
        await incrementWalletBalanceCents(session.user.id, generationCostCents);
        await db.delete(quizGenerationJobs).where(eq(quizGenerationJobs.id, job.id));
        warnings.push("Failed to reserve balance for generation.");
        break;
      }
    }

    try {
      scheduledJobIds.push(job.id);

      if (!shouldUseUrlBatchPlanner && !shouldUsePdfBatchPlanner) {
        const run = await generateQuizTask.trigger({ jobId: job.id });
        triggerRunIds.push(run.id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start generation task";
      scheduledJobIds.pop();
      await failJobStart({
        userId: session.user.id,
        jobId: job.id,
        sourceType: payload.sourceType,
        billingMode,
        amountCents: reservedCharge ? generationCostCents : 0,
        batchIndex: item.batchIndex,
        batchSize: item.batchSize,
        errorMessage: message,
      });
      if (reservedCharge) remainingAffordableCount += 1;

      warnings.push(message);
    }
  }

  if (shouldUseUrlBatchPlanner && scheduledJobIds.length > 0) {
    try {
      const run = await generateUrlBatchTask.trigger({
        jobIds: scheduledJobIds,
      });
      triggerRunIds.push(run.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start URL batch generation task";

      for (const [index, jobId] of scheduledJobIds.entries()) {
        const item = itemsToSchedule[index];
        if (!item) continue;

        await failJobStart({
          userId: session.user.id,
          jobId,
          sourceType: "url",
          billingMode,
          amountCents: billingMode === "platform_credits" ? generationCostCents : 0,
          batchIndex: item.batchIndex,
          batchSize: item.batchSize,
          errorMessage: message,
        });
      }

      if (billingMode === "platform_credits" && generationCostCents > 0) {
        remainingAffordableCount += scheduledJobIds.length;
      }

      warnings.push(message);
      scheduledJobIds.length = 0;
    }
  }

  if (shouldUsePdfBatchPlanner && scheduledJobIds.length > 0) {
    try {
      const run = await generatePdfBatchTask.trigger({
        jobIds: scheduledJobIds,
      });
      triggerRunIds.push(run.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start PDF batch generation task";

      for (const [index, jobId] of scheduledJobIds.entries()) {
        const item = itemsToSchedule[index];
        if (!item) continue;

        await failJobStart({
          userId: session.user.id,
          jobId,
          sourceType: "pdf",
          billingMode,
          amountCents: billingMode === "platform_credits" ? generationCostCents : 0,
          batchIndex: item.batchIndex,
          batchSize: item.batchSize,
          errorMessage: message,
        });
      }

      if (billingMode === "platform_credits" && generationCostCents > 0) {
        remainingAffordableCount += scheduledJobIds.length;
      }

      warnings.push(message);
      scheduledJobIds.length = 0;
    }
  }

  const scheduledCount = scheduledJobIds.length;
  const skippedCount = requestedCount - scheduledCount;

  if (scheduledCount <= 0) {
    if (
      billingMode === "platform_credits" &&
      (remainingAffordableCount <= 0 || balanceChangedDuringScheduling)
    ) {
      return NextResponse.json(
        {
          error: "Insufficient balance for this generation.",
          balanceCents: walletBalanceCents,
          requiredCents: generationCostCents,
          requestedCount,
          schedulableCount: 0,
        },
        { status: 402 },
      );
    }

    return NextResponse.json(
      { error: warnings[0] ?? "Failed to start generation task" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      jobId: scheduledJobIds[0] ?? null,
      jobIds: scheduledJobIds,
      triggerRunId: triggerRunIds[0] ?? null,
      triggerRunIds,
      requestedCount,
      scheduledCount,
      skippedCount,
      partial: scheduledCount < requestedCount,
      warning: warnings[0],
    },
    { status: 202 },
  );
}
