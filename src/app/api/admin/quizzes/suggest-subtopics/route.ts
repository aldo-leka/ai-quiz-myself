import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSessionOrNull } from "@/lib/admin-auth";
import {
  checkHubThemeUniqueness,
  cosineSimilarity,
  ensureHubThemeEmbeddings,
  generateThemeEmbedding,
  getHubThemeEntriesByQuizIds,
  HUB_THEME_SIMILARITY_THRESHOLD,
  normalizeThemeKey,
} from "@/lib/hub-theme-embeddings";
import {
  generateUniqueSubtopics,
  getExistingHubThemeEntriesForCategory,
  getExistingThemesForCategory,
} from "@/lib/quiz-themes";
import { getLanguageModel, resolveUserApiKey } from "@/lib/user-api-keys";

export const runtime = "nodejs";

const requestSchema = z.object({
  broadCategory: z.string().trim().max(120).optional().default("General Knowledge"),
  count: z.number().int().min(1).max(50).default(10),
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  apiKeyId: z.string().uuid().optional(),
});

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
  const broadCategory = payload.broadCategory.trim() || "General Knowledge";
  const credentials = await resolveUserApiKey(adminSession.user.id, payload.apiKeyId);
  if (!credentials) {
    return NextResponse.json(
      { error: "No API key found. Add one in Admin > API Keys." },
      { status: 412 },
    );
  }

  try {
    const model = getLanguageModel(credentials.provider, credentials.apiKey);
    const categoryThemes = await getExistingThemesForCategory(
      broadCategory,
      payload.gameMode,
    );
    const modeThemeEntries = await getExistingHubThemeEntriesForCategory(
      "",
      payload.gameMode,
    );

    await ensureHubThemeEmbeddings(modeThemeEntries);

    const persistedModeThemes = await getHubThemeEntriesByQuizIds(
      modeThemeEntries.map((entry) => entry.quizId),
    );
    const candidateQuizIds = persistedModeThemes.map((entry) => entry.quizId);
    const seenThemeKeys = new Set(categoryThemes.map((theme) => normalizeThemeKey(theme)));
    const roundAvoidThemes = [...categoryThemes];
    const acceptedSubtopics: string[] = [];
    const acceptedEmbeddings: number[][] = [];
    let semanticFilteredCount = 0;

    for (let round = 0; round < 2 && acceptedSubtopics.length < payload.count; round += 1) {
      const remaining = payload.count - acceptedSubtopics.length;
      const generatedPool = await generateUniqueSubtopics({
        broadCategory,
        existingThemes: roundAvoidThemes,
        count: Math.min(Math.max(remaining + 10, payload.count), 60),
        model,
      });

      for (const subtopic of generatedPool) {
        if (acceptedSubtopics.length >= payload.count) break;

        const themeKey = normalizeThemeKey(subtopic);
        roundAvoidThemes.push(subtopic);
        if (seenThemeKeys.has(themeKey)) {
          continue;
        }

        const embedding = await generateThemeEmbedding(subtopic);
        const uniqueness = await checkHubThemeUniqueness({
          embedding,
          gameMode: payload.gameMode,
          candidateQuizIds,
        });

        if (uniqueness.isDuplicate) {
          semanticFilteredCount += 1;
          seenThemeKeys.add(themeKey);
          continue;
        }

        const duplicateWithinBatch = acceptedEmbeddings.some(
          (acceptedEmbedding) =>
            cosineSimilarity(acceptedEmbedding, embedding) >= HUB_THEME_SIMILARITY_THRESHOLD,
        );

        if (duplicateWithinBatch) {
          semanticFilteredCount += 1;
          seenThemeKeys.add(themeKey);
          continue;
        }

        seenThemeKeys.add(themeKey);
        acceptedSubtopics.push(subtopic);
        acceptedEmbeddings.push(embedding);
      }
    }

    return NextResponse.json({
      success: true,
      subtopics: acceptedSubtopics,
      existingThemeCount: persistedModeThemes.length,
      semanticFilteredCount,
      broadCategory,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate unique subtopics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
