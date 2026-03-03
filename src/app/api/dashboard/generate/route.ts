import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { credits, platformSettings, quizGenerationJobs } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { getUserSessionOrNull } from "@/lib/user-auth";
import { resolveUserApiKey, type ProviderName } from "@/lib/user-api-keys";
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
  apiKeyId: z.string().uuid().optional(),
  fileName: z.string().trim().min(1).max(220).optional(),
  fileSizeBytes: z.number().int().positive().max(100 * 1024 * 1024).optional(),
});

function normalizePreferredProvider(value: string | null | undefined): ProviderName | null {
  if (value === "openai" || value === "anthropic" || value === "google") {
    return value;
  }
  return null;
}

function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase();
}

function parseSettingInt(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
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

export async function POST(request: Request) {
  const session = await getUserSessionOrNull();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const normalizedLanguage = normalizeLanguage(payload.language);
  const effectiveDifficulty =
    payload.gameMode === "wwtbam" ? "escalating" : payload.difficulty;

  const [userRow] = await db
    .select({
      preferredProvider: user.preferredProvider,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (payload.sourceType === "theme" && !payload.theme) {
    return NextResponse.json({ error: "Theme is required for this generation mode." }, { status: 400 });
  }

  if (payload.sourceType === "url" && !payload.url) {
    return NextResponse.json({ error: "URL is required for this generation mode." }, { status: 400 });
  }

  if (payload.sourceType === "pdf" && !payload.fileName) {
    return NextResponse.json({ error: "PDF file is required for this generation mode." }, { status: 400 });
  }

  let provider: ProviderName = "openai";
  let resolvedApiKeyId: string | undefined;

  if (payload.sourceType !== "pdf") {
    const preferredProvider = normalizePreferredProvider(userRow?.preferredProvider);
    const selectedKey = await resolveUserApiKey(
      session.user.id,
      payload.apiKeyId,
      preferredProvider,
    );

    if (!selectedKey) {
      return NextResponse.json(
        { error: "No API key found. Add one in Dashboard > API Keys." },
        { status: 412 },
      );
    }

    provider = selectedKey.provider;
    resolvedApiKeyId = selectedKey.id;
  } else {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Platform OpenAI key is not configured for PDF generation." },
        { status: 412 },
      );
    }

    const [costSetting, creditRow] = await Promise.all([
      db
        .select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.key, "credit_cost_pdf_generation"))
        .limit(1),
      db
        .select({ balance: credits.balance })
        .from(credits)
        .where(eq(credits.userId, session.user.id))
        .limit(1),
    ]);

    const pdfCreditCost = parseSettingInt(costSetting[0]?.value, 1);
    const creditBalance = Number(creditRow[0]?.balance ?? 0);
    if (creditBalance < pdfCreditCost) {
      return NextResponse.json(
        {
          error: "Insufficient credits for PDF generation.",
          creditBalance,
          creditCost: pdfCreditCost,
        },
        { status: 402 },
      );
    }

    provider = "openai";
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
        isPublic: true,
        apiKeyId: resolvedApiKeyId,
        fileName: payload.fileName,
        fileSizeBytes: payload.fileSizeBytes,
      },
      provider,
      errorMessage: null,
    })
    .returning({
      id: quizGenerationJobs.id,
      status: quizGenerationJobs.status,
      createdAt: quizGenerationJobs.createdAt,
    });

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

    return NextResponse.json({ error: "Failed to start generation task" }, { status: 500 });
  }
}
