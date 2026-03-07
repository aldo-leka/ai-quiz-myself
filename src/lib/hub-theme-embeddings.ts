import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { hubThemeEmbeddings, quizzes } from "@/db/schema";
import { generateEmbedding } from "@/lib/quiz-embeddings";

export const HUB_THEME_SIMILARITY_THRESHOLD = 0.9;
const THEME_EMBEDDING_DIMENSIONS = 1536;

export type HubThemeEntry = {
  quizId: string;
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
};

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export function normalizeThemeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeThemeKey(value: string): string {
  return normalizeThemeValue(value).toLowerCase();
}

export async function generateThemeEmbedding(theme: string): Promise<number[]> {
  const normalizedTheme = normalizeThemeValue(theme);
  if (!normalizedTheme) {
    throw new Error("Cannot generate embedding from empty theme");
  }

  return generateEmbedding([`Quiz hub theme: ${normalizedTheme}`]);
}

export async function upsertHubThemeEmbedding(params: {
  quizId: string;
  theme: string;
  gameMode: "single" | "wwtbam" | "couch_coop";
  embedding?: number[];
}) {
  const theme = normalizeThemeValue(params.theme);
  const embedding = params.embedding ?? (await generateThemeEmbedding(theme));

  if (embedding.length !== THEME_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${THEME_EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  await db
    .insert(hubThemeEmbeddings)
    .values({
      quizId: params.quizId,
      theme,
      themeKey: normalizeThemeKey(theme),
      gameMode: params.gameMode,
      embedding,
    })
    .onConflictDoUpdate({
      target: hubThemeEmbeddings.quizId,
      set: {
        theme,
        themeKey: normalizeThemeKey(theme),
        gameMode: params.gameMode,
        embedding,
        updatedAt: new Date(),
      },
    });
}

export async function ensureHubThemeEmbeddings(entries: HubThemeEntry[]) {
  if (entries.length === 0) return;

  const dedupedByQuizId = new Map<string, HubThemeEntry>();
  for (const entry of entries) {
    if (!dedupedByQuizId.has(entry.quizId)) {
      dedupedByQuizId.set(entry.quizId, entry);
    }
  }

  const dedupedEntries = [...dedupedByQuizId.values()];
  const existingRows = await db
    .select({
      quizId: hubThemeEmbeddings.quizId,
    })
    .from(hubThemeEmbeddings)
    .where(inArray(hubThemeEmbeddings.quizId, dedupedEntries.map((entry) => entry.quizId)));

  const existingQuizIds = new Set(existingRows.map((row) => row.quizId));
  const missingEntries = dedupedEntries.filter((entry) => !existingQuizIds.has(entry.quizId));

  for (const entry of missingEntries) {
    await upsertHubThemeEmbedding(entry);
  }
}

export async function getHubThemeEntriesByQuizIds(quizIds: string[]) {
  if (quizIds.length === 0) return [];

  return db
    .select({
      quizId: hubThemeEmbeddings.quizId,
      theme: hubThemeEmbeddings.theme,
      themeKey: hubThemeEmbeddings.themeKey,
      gameMode: hubThemeEmbeddings.gameMode,
    })
    .from(hubThemeEmbeddings)
    .where(inArray(hubThemeEmbeddings.quizId, quizIds))
    .orderBy(asc(hubThemeEmbeddings.theme));
}

export async function checkHubThemeUniqueness(params: {
  embedding: number[];
  gameMode: "single" | "wwtbam" | "couch_coop";
  candidateQuizIds?: string[];
  threshold?: number;
}): Promise<{
  isDuplicate: boolean;
  mostSimilarQuizId?: string;
  mostSimilarTheme?: string;
  similarity: number;
}> {
  if (params.embedding.length !== THEME_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${THEME_EMBEDDING_DIMENSIONS}, got ${params.embedding.length}`,
    );
  }

  const quizIds = params.candidateQuizIds?.filter((value) => value.length > 0) ?? [];
  if (params.candidateQuizIds && quizIds.length === 0) {
    return {
      isDuplicate: false,
      similarity: 0,
    };
  }

  const vectorLiteral = toVectorLiteral(params.embedding);
  const threshold = params.threshold ?? HUB_THEME_SIMILARITY_THRESHOLD;
  const filters = [
    eq(hubThemeEmbeddings.gameMode, params.gameMode),
    eq(quizzes.isHub, true),
  ];

  if (quizIds.length > 0) {
    filters.push(inArray(hubThemeEmbeddings.quizId, quizIds));
  }

  const result = await db.execute<{
    quizId: string;
    theme: string;
    similarity: string | number | null;
  }>(sql`
    select
      ${hubThemeEmbeddings.quizId} as "quizId",
      ${hubThemeEmbeddings.theme} as "theme",
      1 - (${hubThemeEmbeddings.embedding} <=> ${vectorLiteral}::vector) as "similarity"
    from ${hubThemeEmbeddings}
    inner join ${quizzes} on ${quizzes.id} = ${hubThemeEmbeddings.quizId}
    where ${and(...filters)}
    order by ${hubThemeEmbeddings.embedding} <=> ${vectorLiteral}::vector
    limit 1
  `);

  const nearest = result.rows[0];
  if (!nearest || nearest.similarity === null) {
    return {
      isDuplicate: false,
      similarity: 0,
    };
  }

  const similarity =
    typeof nearest.similarity === "number"
      ? nearest.similarity
      : Number.parseFloat(nearest.similarity);

  if (!Number.isFinite(similarity)) {
    return {
      isDuplicate: false,
      similarity: 0,
    };
  }

  return {
    isDuplicate: similarity >= threshold,
    mostSimilarQuizId: nearest.quizId,
    mostSimilarTheme: nearest.theme,
    similarity,
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
