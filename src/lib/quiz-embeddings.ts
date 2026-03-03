import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { quizEmbeddings, quizzes } from "@/db/schema";
import { requireEnv } from "@/lib/env";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export async function generateEmbedding(texts: string[]): Promise<number[]> {
  const cleanedTexts = texts.map((text) => text.trim()).filter((text) => text.length > 0);
  if (cleanedTexts.length === 0) {
    throw new Error("Cannot generate embedding from empty text");
  }

  const openai = createOpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
  });

  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: cleanedTexts.join("\n\n"),
  });

  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  return embedding;
}

export async function checkHubUniqueness(
  embedding: number[],
  threshold = 0.85,
): Promise<{
  isDuplicate: boolean;
  mostSimilarQuizId?: string;
  similarity: number;
}> {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  const vectorLiteral = toVectorLiteral(embedding);
  const result = await db.execute<{
    quizId: string;
    similarity: string | number | null;
  }>(sql`
    select
      ${quizEmbeddings.quizId} as "quizId",
      1 - (${quizEmbeddings.embedding} <=> ${vectorLiteral}::vector) as "similarity"
    from ${quizEmbeddings}
    inner join ${quizzes} on ${quizzes.id} = ${quizEmbeddings.quizId}
    where ${eq(quizzes.isHub, true)}
    order by ${quizEmbeddings.embedding} <=> ${vectorLiteral}::vector
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
    similarity,
  };
}

export async function storeQuizEmbedding(quizId: string, embedding: number[]): Promise<void> {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Unexpected embedding dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.length}`,
    );
  }

  await db
    .insert(quizEmbeddings)
    .values({
      quizId,
      embedding,
    })
    .onConflictDoUpdate({
      target: quizEmbeddings.quizId,
      set: {
        embedding,
      },
    });
}
