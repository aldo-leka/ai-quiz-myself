import { generateObject } from "ai";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { surpriseThemeHistory } from "@/db/schema";
import { user } from "@/db/schema/auth";
import { generateEmbedding } from "@/lib/quiz-embeddings";
import { getUserSessionOrNull } from "@/lib/user-auth";
import {
  getLanguageModel,
  resolveUserApiKey,
  type ProviderName,
} from "@/lib/user-api-keys";

export const runtime = "nodejs";

const CANDIDATE_COUNT = 8;
const HISTORY_LIMIT = 200;
const THEME_SIMILARITY_THRESHOLD = 0.9;

const requestSchema = z.object({
  gameMode: z.enum(["single", "wwtbam", "couch_coop"]),
  language: z.string().trim().min(2).max(16).default("en"),
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
      { error: "No API key found. Add one in Dashboard > API Keys, or configure platform billing." },
      { status: 412 },
    );
  }

  const model = credentials
    ? getLanguageModel(credentials.provider, credentials.apiKey)
    : getLanguageModel("openai", platformApiKey!);

  const { object } = await generateObject({
    model,
    schema: z.object({
      themes: z.array(z.string().min(3).max(80)).min(CANDIDATE_COUNT).max(12),
    }),
    prompt: [
      `Suggest ${CANDIDATE_COUNT} family-friendly quiz themes.`,
      `Language/locale: ${parsed.data.language}`,
      `Game mode: ${parsed.data.gameMode}`,
      "Constraints:",
      "- Keep each theme specific and engaging.",
      "- Keep each theme under 80 characters.",
      "- Do not repeat or rephrase themes from the avoid list.",
      "- Return distinct themes only.",
      "",
      "Avoid list:",
      avoidList.length > 0 ? avoidList.join("\n") : "none",
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

  let selectedTheme: string | null = null;
  let selectedThemeKey: string | null = null;
  let selectedEmbedding: number[] | null = null;

  for (const candidate of candidates) {
    const key = toThemeKey(candidate);
    if (historyThemeKeys.has(key)) {
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

      selectedTheme = candidate;
      selectedThemeKey = key;
      selectedEmbedding = embedding;
      break;
    } catch {
      // If embedding infrastructure is unavailable, fall back to exact-match dedupe only.
      selectedTheme = candidate;
      selectedThemeKey = key;
      selectedEmbedding = null;
      break;
    }
  }

  if (!selectedTheme || !selectedThemeKey) {
    return NextResponse.json(
      { error: "Could not find a sufficiently unique surprise theme. Try again." },
      { status: 409 },
    );
  }

  await db
    .insert(surpriseThemeHistory)
    .values({
      userId: session.user.id,
      gameMode: parsed.data.gameMode,
      language: normalizedLanguage,
      theme: selectedTheme,
      themeKey: selectedThemeKey,
      embedding: selectedEmbedding,
    })
    .onConflictDoNothing({
      target: [
        surpriseThemeHistory.userId,
        surpriseThemeHistory.gameMode,
        surpriseThemeHistory.language,
        surpriseThemeHistory.themeKey,
      ],
    });

  return NextResponse.json({
    theme: selectedTheme,
  });
}
