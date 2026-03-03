import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys, quizGenerationJobs } from "@/db/schema";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import { generateQuizTask } from "@/trigger/generate-quiz";

export const runtime = "nodejs";

const requestSchema = z.object({
  theme: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().trim().min(2).max(120).optional(),
  ),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  difficulty: z.enum(["easy", "medium", "hard", "mixed", "escalating"]),
  language: z.string().trim().min(2).max(10).default("en"),
  apiKeyId: z.string().uuid().optional(),
});

const fallbackThemeByMode: Record<"single" | "wwtbam" | "couch_coop", string> = {
  single: "General Knowledge",
  wwtbam: "General Knowledge",
  couch_coop: "Family Trivia",
};

export async function POST(request: Request) {
  const adminSession = await getAdminSessionOrNull();
  if (!adminSession) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  const theme = payload.theme?.trim() || fallbackThemeByMode[payload.gameMode];
  const effectiveDifficulty =
    payload.gameMode === "wwtbam" ? "escalating" : payload.difficulty;
  const normalizedLanguage = payload.language.trim().toLowerCase();
  const isEnglish = normalizedLanguage === "en" || normalizedLanguage.startsWith("en-");
  const isHub = isEnglish;
  const isPublic = true;

  const selectedKey = payload.apiKeyId
    ? (
      await db
        .select({
          id: apiKeys.id,
          provider: apiKeys.provider,
        })
        .from(apiKeys)
        .where(and(eq(apiKeys.id, payload.apiKeyId), eq(apiKeys.userId, adminSession.user.id)))
        .limit(1)
    )[0]
    : (
      await db
        .select({
          id: apiKeys.id,
          provider: apiKeys.provider,
        })
        .from(apiKeys)
        .where(eq(apiKeys.userId, adminSession.user.id))
        .orderBy(desc(apiKeys.createdAt))
        .limit(1)
    )[0];

  if (!selectedKey) {
    return NextResponse.json({ error: "No API key found. Add one in Admin > API Keys." }, { status: 412 });
  }

  const [job] = await db
    .insert(quizGenerationJobs)
    .values({
      userId: adminSession.user.id,
      status: "pending",
      sourceType: "theme",
      inputData: {
        theme,
        gameMode: payload.gameMode,
        difficulty: effectiveDifficulty,
        language: normalizedLanguage,
        isHub,
        reviewForHub: false,
        isPublic,
        apiKeyId: selectedKey.id,
      },
      provider: selectedKey.provider,
      errorMessage: null,
    })
    .returning({
      id: quizGenerationJobs.id,
      status: quizGenerationJobs.status,
      createdAt: quizGenerationJobs.createdAt,
      inputData: quizGenerationJobs.inputData,
    });

  try {
    const run = await generateQuizTask.trigger({ jobId: job.id });
    return NextResponse.json(
      {
        success: true,
        job: {
          ...job,
          triggerRunId: run.id,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start generation task";

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
