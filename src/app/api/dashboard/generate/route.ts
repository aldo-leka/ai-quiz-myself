import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { creditTransactions, credits, platformSettings, quizGenerationJobs } from "@/db/schema";
import { user } from "@/db/schema/auth";
import {
  computeGenerationCostCents,
  parsePositiveInt,
  type GenerationBillingMode,
} from "@/lib/billing";
import { isR2Configured } from "@/lib/r2";
import { getUserSessionOrNull } from "@/lib/user-auth";
import { resolveUserApiKey, type ProviderName } from "@/lib/user-api-keys";
import { incrementWalletBalanceCents, tryDeductWalletBalanceCents } from "@/lib/wallet";
import { generateQuizTask } from "@/trigger/generate-quiz";

export const runtime = "nodejs";

const requestSchema = z.object({
  sourceType: z.enum(["theme", "url", "pdf"]),
  theme: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(2).max(140).optional(),
  ),
  url: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().url().optional(),
  ),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  language: z.string().trim().min(2).max(16).default("en"),
  billingMode: z.enum(["byok", "platform_credits"]).optional(),
  apiKeyId: z.string().uuid().optional(),
  fileName: z.string().trim().min(1).max(220).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
  pdfObjectKey: z.string().trim().min(1).max(500).optional(),
});

const MAX_MULTIPART_PDF_FILE_SIZE_BYTES = 8 * 1024 * 1024;

type ParsedGenerateRequest = {
  sourceType: "theme" | "url" | "pdf";
  theme?: string;
  url?: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  language: string;
  billingMode?: "byok" | "platform_credits";
  apiKeyId?: string;
  fileName?: string;
  fileSizeBytes?: number;
  pdfBase64?: string;
  pdfObjectKey?: string;
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

async function parseGenerateRequest(request: Request): Promise<{
  payload: ParsedGenerateRequest;
  error?: { status: number; message: string; issues?: unknown };
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const formData = await request.formData();

    const sourceTypeRaw = formData.get("sourceType");
    const sourceType = typeof sourceTypeRaw === "string" ? sourceTypeRaw : "";
    if (sourceType !== "pdf") {
      return {
        payload: {
          sourceType: "pdf",
          gameMode: "single",
          difficulty: "mixed",
          language: "en",
        },
        error: {
          status: 400,
          message: "Multipart uploads are only supported for PDF generation.",
        },
      };
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return {
        payload: {
          sourceType: "pdf",
          gameMode: "single",
          difficulty: "mixed",
          language: "en",
        },
        error: {
          status: 400,
          message: "PDF file is required for this generation mode.",
        },
      };
    }

    const isPdf =
      fileEntry.type.toLowerCase() === "application/pdf" ||
      fileEntry.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return {
        payload: {
          sourceType: "pdf",
          gameMode: "single",
          difficulty: "mixed",
          language: "en",
        },
        error: {
          status: 400,
          message: "Only PDF files are supported.",
        },
      };
    }

    if (fileEntry.size <= 0 || fileEntry.size > MAX_MULTIPART_PDF_FILE_SIZE_BYTES) {
      return {
        payload: {
          sourceType: "pdf",
          gameMode: "single",
          difficulty: "mixed",
          language: "en",
        },
        error: {
          status: 400,
          message: `PDF is too large. Max size is ${Math.floor(MAX_MULTIPART_PDF_FILE_SIZE_BYTES / (1024 * 1024))}MB.`,
        },
      };
    }

    const gameModeRaw = formData.get("gameMode");
    const difficultyRaw = formData.get("difficulty");
    const languageRaw = formData.get("language");
    const billingModeRaw = formData.get("billingMode");
    const apiKeyIdRaw = formData.get("apiKeyId");

    const parsed = requestSchema.safeParse({
      sourceType: "pdf",
      gameMode: typeof gameModeRaw === "string" ? gameModeRaw : undefined,
      difficulty: typeof difficultyRaw === "string" ? difficultyRaw : undefined,
      language: typeof languageRaw === "string" ? languageRaw : "en",
      billingMode: typeof billingModeRaw === "string" ? billingModeRaw : undefined,
      apiKeyId: typeof apiKeyIdRaw === "string" ? apiKeyIdRaw : undefined,
    });

    if (!parsed.success) {
      return {
        payload: {
          sourceType: "pdf",
          gameMode: "single",
          difficulty: "mixed",
          language: "en",
        },
        error: {
          status: 400,
          message: "Invalid payload",
          issues: parsed.error.issues,
        },
      };
    }

    const arrayBuffer = await fileEntry.arrayBuffer();
    const pdfBase64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      payload: {
        ...parsed.data,
        fileName: fileEntry.name,
        fileSizeBytes: fileEntry.size,
        pdfBase64,
      },
    };
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return {
      payload: {
        sourceType: "theme",
        gameMode: "single",
        difficulty: "mixed",
        language: "en",
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
        eq(
          platformSettings.key,
          payload.sourceType === "pdf"
            ? "credit_cost_pdf_generation"
            : "credit_cost_ai_generation",
        ),
      )
      .limit(1),
    db
      .select({
        balanceCents: credits.balanceCents,
      })
      .from(credits)
      .where(eq(credits.userId, session.user.id))
      .limit(1),
  ]);

  const userRow = userRows[0];
  const generationMultiplier = parsePositiveInt(settingRows[0]?.value, 1);
  const generationCostCents = computeGenerationCostCents(generationMultiplier);
  const walletBalanceCents = Number(walletRows[0]?.balanceCents ?? 0);

  const billingMode = resolveBillingMode({
    sourceType: payload.sourceType,
    requestedBillingMode: payload.billingMode,
    hasSufficientCredits: walletBalanceCents >= generationCostCents,
    platformBillingAvailable,
  });

  if (payload.sourceType === "theme" && !payload.theme) {
    return NextResponse.json({ error: "Theme is required for this generation mode." }, { status: 400 });
  }

  if (payload.sourceType === "url" && !payload.url) {
    return NextResponse.json({ error: "URL is required for this generation mode." }, { status: 400 });
  }

  if (
    payload.sourceType === "pdf" &&
    (!payload.fileName || (!payload.pdfBase64 && !payload.pdfObjectKey))
  ) {
    return NextResponse.json({ error: "PDF file is required for this generation mode." }, { status: 400 });
  }

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
        { error: "No API key found. Add one in Dashboard > Settings." },
        { status: 412 },
      );
    }

    provider = selectedKey.provider;
    resolvedApiKeyId = selectedKey.id;
  }

  const displayTheme =
    payload.sourceType === "theme"
      ? payload.theme
      : payload.sourceType === "url" && payload.url
        ? hostnameForUrl(payload.url)
        : payload.fileName
          ? fileBaseName(payload.fileName)
          : "Generated Quiz";

  const [job] = await db
    .insert(quizGenerationJobs)
    .values({
      userId: session.user.id,
      status: "pending",
      sourceType: payload.sourceType,
      inputData: {
        theme: payload.theme,
        displayTheme,
        url: payload.url,
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
        pdfBase64: payload.pdfBase64,
        pdfObjectKey: payload.pdfObjectKey,
      },
      provider,
      errorMessage: null,
    })
    .returning({
      id: quizGenerationJobs.id,
      status: quizGenerationJobs.status,
      createdAt: quizGenerationJobs.createdAt,
    });

  let reservedCharge = false;

  if (billingMode === "platform_credits" && generationCostCents > 0) {
    const deducted = await tryDeductWalletBalanceCents({
      userId: session.user.id,
      amountCents: generationCostCents,
    });

    if (!deducted) {
      await db.delete(quizGenerationJobs).where(eq(quizGenerationJobs.id, job.id));
      return NextResponse.json(
        {
          error: "Insufficient balance for this generation.",
          balanceCents: walletBalanceCents,
          requiredCents: generationCostCents,
        },
        { status: 402 },
      );
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
        },
      });
      reservedCharge = true;
    } catch {
      await incrementWalletBalanceCents(session.user.id, generationCostCents);
      await db.delete(quizGenerationJobs).where(eq(quizGenerationJobs.id, job.id));
      return NextResponse.json(
        { error: "Failed to reserve balance for generation." },
        { status: 500 },
      );
    }
  }

  try {
    const run = await generateQuizTask.trigger({ jobId: job.id });
    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        triggerRunId: run.id,
      },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start generation task";

    await db
      .update(quizGenerationJobs)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 500),
      })
      .where(eq(quizGenerationJobs.id, job.id));

    if (reservedCharge) {
      await incrementWalletBalanceCents(session.user.id, generationCostCents);
      await db
        .update(creditTransactions)
        .set({
          status: "failed",
          description: "Quiz generation charge refunded (task start failed)",
          metadata: {
            sourceType: payload.sourceType,
            billingMode,
            reason: "task_start_failed_refund",
          },
        })
        .where(eq(creditTransactions.generationJobId, job.id));
    }

    return NextResponse.json({ error: "Failed to start generation task" }, { status: 500 });
  }
}
