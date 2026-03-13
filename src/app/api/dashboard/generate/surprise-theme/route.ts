import { generateObject } from "ai";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { surpriseThemeHistory } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { generateEmbedding } from "@/lib/quiz-embeddings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getUserSessionOrNull } from "@/lib/user-auth";
import {
  getLanguageModel,
  resolveUserApiKey,
  type ProviderName,
} from "@/lib/user-api-keys";

export const runtime = "nodejs";

const MIN_CANDIDATE_COUNT = 8;
const MAX_CANDIDATE_COUNT = 48;
const MAX_BATCH_COUNT = 100;
const MAX_GENERATION_ROUNDS = 5;
const HISTORY_LIMIT = 200;
const THEME_SIMILARITY_THRESHOLD = 0.9;
const SURPRISE_THEME_RATE_LIMIT = {
  limit: 6,
  windowMs: 60_000,
  errorMessage: "Too many surprise theme requests. Please wait a moment and try again.",
} as const;

const requestSchema = z.object({
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  language: z.string().trim().min(2).max(16).default("en"),
  count: z.preprocess(
    (value) => {
      if (typeof value === "string" && value.trim().length > 0) {
        return Number.parseInt(value, 10);
      }
      return value;
    },
    z.number().int().min(1).max(MAX_BATCH_COUNT).default(1),
  ),
  excludeThemes: z.array(z.string().trim().min(2).max(80)).max(100).optional(),
});

function normalizePreferredProvider(value: string | null | undefined): ProviderName | null {
  if (value === "openai" || value === "anthropic" || value === "google") {
    return value;
  }
  return null;
}

function normalizeLanguageTag(language: string): string {
  return language.trim().toLowerCase();
}

function normalizeTheme(theme: string): string {
  return theme.replace(/\s+/g, " ").trim();
}

function toThemeKey(theme: string): string {
  return normalizeTheme(theme).toLowerCase();
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = a[index] ?? 0;
    const valueB = b[index] ?? 0;
    dot += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA <= 0 || magnitudeB <= 0) {
    return 0;
  }

  return dot / Math.sqrt(magnitudeA * magnitudeB);
}

export async function POST(request: Request) {
  try {
    const session = await getUserSessionOrNull();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitResponse = await enforceRateLimit({
      scope: "surprise_theme",
      identifier: `user:${session.user.id}`,
      ...SURPRISE_THEME_RATE_LIMIT,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const normalizedLanguage = normalizeLanguageTag(parsed.data.language);

    const [userRows, historyRows] = await Promise.all([
      db
        .select({ preferredProvider: user.preferredProvider })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1),
      db
        .select({
          theme: surpriseThemeHistory.theme,
          themeKey: surpriseThemeHistory.themeKey,
        })
        .from(surpriseThemeHistory)
        .where(
          sql`${surpriseThemeHistory.userId} = ${session.user.id}
              and ${surpriseThemeHistory.gameMode} = ${parsed.data.gameMode}
              and ${surpriseThemeHistory.language} = ${normalizedLanguage}`,
        )
        .orderBy(sql`${surpriseThemeHistory.createdAt} desc`)
        .limit(HISTORY_LIMIT),
    ]);

    const historyThemeKeys = new Set(historyRows.map((row) => row.themeKey));
    for (const theme of parsed.data.excludeThemes ?? []) {
      historyThemeKeys.add(toThemeKey(theme));
    }

    const avoidList = historyRows.map((row) => row.theme).concat(parsed.data.excludeThemes ?? []);

    const preferredProvider = normalizePreferredProvider(userRows[0]?.preferredProvider);
    const credentials = await resolveUserApiKey(session.user.id, undefined, preferredProvider);
    const platformApiKey = process.env.OPENAI_API_KEY;

    if (!credentials && !platformApiKey) {
      return NextResponse.json(
        { error: "No API key found. Add one in Settings, or configure platform billing." },
        { status: 412 },
      );
    }

    const model = credentials
      ? getLanguageModel(credentials.provider, credentials.apiKey)
      : getLanguageModel("openai", platformApiKey!);

    const requestedCount = parsed.data.count;
    const selectedThemes: Array<{
      theme: string;
      themeKey: string;
      embedding: number[] | null;
    }> = [];
    const selectedThemeKeys = new Set<string>();

    for (let round = 0; round < MAX_GENERATION_ROUNDS; round += 1) {
      if (selectedThemes.length >= requestedCount) {
        break;
      }

      const remainingCount = requestedCount - selectedThemes.length;
      const candidateCount = Math.min(
        MAX_CANDIDATE_COUNT,
        Math.max(MIN_CANDIDATE_COUNT, remainingCount * 4),
      );
      const minimumReturnedCount = Math.min(
        candidateCount,
        Math.max(1, Math.min(remainingCount, 4)),
      );
      const roundAvoidList = avoidList.concat(selectedThemes.map((entry) => entry.theme));

      const { object } = await generateObject({
        model,
        schema: z.object({
          themes: z
            .array(z.string().min(3).max(80))
            .min(minimumReturnedCount)
            .max(MAX_CANDIDATE_COUNT),
        }),
        prompt: [
          `Suggest ${candidateCount} family-friendly quiz themes.`,
          `Need ${remainingCount} more unique themes for this batch.`,
          `Language/locale: ${parsed.data.language}`,
          `Game mode: ${parsed.data.gameMode}`,
          "Constraints:",
          "- Keep each theme specific and engaging.",
          "- Keep each theme under 80 characters.",
          "- Do not repeat or rephrase themes from the avoid list.",
          "- Return distinct themes only.",
          "",
          "Avoid list:",
          roundAvoidList.length > 0 ? roundAvoidList.join("\n") : "none",
        ].join("\n"),
      });

      const candidates: string[] = [];
      const seenCandidateKeys = new Set<string>();
      for (const rawTheme of object.themes) {
        const normalized = normalizeTheme(rawTheme);
        if (!normalized) continue;

        const key = toThemeKey(normalized);
        if (seenCandidateKeys.has(key)) continue;

        seenCandidateKeys.add(key);
        candidates.push(normalized);
      }

      for (const candidate of candidates) {
        if (selectedThemes.length >= requestedCount) {
          break;
        }

        const key = toThemeKey(candidate);
        if (historyThemeKeys.has(key) || selectedThemeKeys.has(key)) {
          continue;
        }

        try {
          const embedding = await generateEmbedding([candidate]);
          const vectorLiteral = toVectorLiteral(embedding);
          const similarityResult = await db.execute<{
            similarity: string | number | null;
          }>(sql`
            select
              1 - (${surpriseThemeHistory.embedding} <=> ${vectorLiteral}::vector) as "similarity"
            from ${surpriseThemeHistory}
            where ${surpriseThemeHistory.userId} = ${session.user.id}
              and ${surpriseThemeHistory.gameMode} = ${parsed.data.gameMode}
              and ${surpriseThemeHistory.language} = ${normalizedLanguage}
              and ${surpriseThemeHistory.embedding} is not null
            order by ${surpriseThemeHistory.embedding} <=> ${vectorLiteral}::vector
            limit 1
          `);

          const nearest = similarityResult.rows[0];
          const similarity =
            nearest?.similarity === null || nearest?.similarity === undefined
              ? 0
              : typeof nearest.similarity === "number"
                ? nearest.similarity
                : Number.parseFloat(nearest.similarity);

          if (Number.isFinite(similarity) && similarity >= THEME_SIMILARITY_THRESHOLD) {
            continue;
          }

          const tooSimilarToSelection = selectedThemes.some((entry) => {
            if (!entry.embedding) return false;
            return cosineSimilarity(entry.embedding, embedding) >= THEME_SIMILARITY_THRESHOLD;
          });
          if (tooSimilarToSelection) {
            continue;
          }

          selectedThemes.push({
            theme: candidate,
            themeKey: key,
            embedding,
          });
          selectedThemeKeys.add(key);
        } catch {
          // If embedding infrastructure is unavailable, fall back to exact-match dedupe only.
          selectedThemes.push({
            theme: candidate,
            themeKey: key,
            embedding: null,
          });
          selectedThemeKeys.add(key);
        }
      }
    }

    if (selectedThemes.length < requestedCount) {
      return NextResponse.json(
        {
          error:
            requestedCount === 1
              ? "Could not find a sufficiently unique surprise theme. Try again."
              : "Could not find enough sufficiently unique surprise themes. Try a smaller batch or different settings.",
        },
        { status: 409 },
      );
    }

    await db
      .insert(surpriseThemeHistory)
      .values(
        selectedThemes.map((entry) => ({
          userId: session.user.id,
          gameMode: parsed.data.gameMode,
          language: normalizedLanguage,
          theme: entry.theme,
          themeKey: entry.themeKey,
          embedding: entry.embedding,
        })),
      )
      .onConflictDoNothing({
        target: [
          surpriseThemeHistory.userId,
          surpriseThemeHistory.gameMode,
          surpriseThemeHistory.language,
          surpriseThemeHistory.themeKey,
        ],
      });

    const themes = selectedThemes.map((entry) => entry.theme);

    return NextResponse.json({
      theme: themes[0],
      themes,
    });
  } catch (error) {
    console.error("Failed to suggest surprise themes", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to suggest surprise themes",
      },
      { status: 500 },
    );
  }
}
