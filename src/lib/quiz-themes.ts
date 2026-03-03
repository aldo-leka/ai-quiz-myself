import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toKey(value: string): string {
  return normalizeValue(value).toLowerCase();
}

export async function getExistingThemesForCategory(category: string): Promise<string[]> {
  const normalizedCategory = normalizeValue(category);
  const filters = [eq(quizzes.isHub, true)];

  if (normalizedCategory.length > 0) {
    const pattern = `%${normalizedCategory}%`;
    filters.push(
      or(
        ilike(quizzes.theme, pattern),
        ilike(quizzes.title, pattern),
        ilike(quizzes.description, pattern),
        sql`exists (
          select 1
          from ${questions}
          where ${questions.quizId} = ${quizzes.id}
            and ${questions.subject} ilike ${pattern}
        )`,
      )!,
    );
  }

  const rows = await db
    .selectDistinct({
      theme: quizzes.theme,
    })
    .from(quizzes)
    .where(and(...filters))
    .orderBy(asc(quizzes.theme))
    .limit(500);

  const seen = new Set<string>();
  const uniqueThemes: string[] = [];
  for (const row of rows) {
    const theme = normalizeValue(row.theme);
    if (!theme) continue;
    const key = toKey(theme);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueThemes.push(theme);
  }

  return uniqueThemes;
}

export async function generateUniqueSubtopics(params: {
  broadCategory: string;
  existingThemes: string[];
  count: number;
  model: LanguageModel;
}): Promise<string[]> {
  const broadCategory = normalizeValue(params.broadCategory);
  if (!broadCategory) {
    throw new Error("Broad category is required");
  }
  if (!Number.isInteger(params.count) || params.count <= 0) {
    throw new Error("Count must be a positive integer");
  }

  const existingThemes = params.existingThemes
    .map((theme) => normalizeValue(theme))
    .filter((theme) => theme.length > 0);

  const maxGenerated = Math.max(params.count * 3, params.count);
  const schema = z.object({
    subtopics: z.array(z.string().min(2).max(80)).min(params.count).max(maxGenerated),
  });

  const existingThemeList =
    existingThemes.length === 0
      ? "No existing themes."
      : existingThemes
          .slice(0, 300)
          .map((theme, index) => `${index + 1}. ${theme}`)
          .join("\n");

  const { object } = await generateObject({
    model: params.model,
    schema,
    temperature: 0.4,
    prompt: [
      "You are creating concise quiz subtopics for a quiz hub catalog.",
      `Broad category: ${broadCategory}`,
      `Return ${params.count} unique subtopics for this category.`,
      "Rules:",
      "- Subtopics must be distinct, specific, and family-friendly.",
      "- Do not repeat or rephrase existing themes.",
      "- Prefer globally understandable topics.",
      "- Keep each subtopic under 80 characters.",
      "",
      "Existing themes to avoid:",
      existingThemeList,
    ].join("\n"),
  });

  const existingKeys = new Set(existingThemes.map((theme) => toKey(theme)));
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const raw of object.subtopics) {
    const cleaned = normalizeValue(raw);
    if (!cleaned) continue;
    const key = toKey(cleaned);
    if (existingKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(cleaned);
    if (deduped.length >= params.count) break;
  }

  if (deduped.length < params.count) {
    throw new Error("Could not generate enough unique subtopics");
  }

  return deduped;
}
