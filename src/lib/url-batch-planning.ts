import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

const MAX_SOURCE_CONTEXT_CHARS = 14_000;
const MAX_SUBTOPIC_ROUNDS = 4;
const MAX_SUBTOPIC_CANDIDATES = 24;

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toKey(value: string): string {
  return normalizeValue(value).toLowerCase();
}

function tokenize(value: string): Set<string> {
  const cleaned = normalizeValue(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 3);

  return new Set(cleaned);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }

  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

function subtopicsTooSimilar(left: string, right: string): boolean {
  const leftKey = toKey(left);
  const rightKey = toKey(right);
  if (leftKey === rightKey) {
    return true;
  }

  if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return true;
  }

  return jaccardSimilarity(tokenize(left), tokenize(right)) >= 0.72;
}

export async function generateUniqueSourceSubtopics(params: {
  title: string;
  sourceText: string;
  count: number;
  model: LanguageModel;
  existingSubtopics?: string[];
}): Promise<string[]> {
  const title = normalizeValue(params.title) || "Article";
  const sourceText = normalizeValue(params.sourceText).slice(0, MAX_SOURCE_CONTEXT_CHARS);
  const requestedCount = Math.max(1, Math.floor(params.count));
  const accepted: string[] = [];
  const existing = (params.existingSubtopics ?? [])
    .map((value) => normalizeValue(value))
    .filter((value) => value.length > 0);
  const avoidList = [...existing];

  if (!sourceText) {
    throw new Error("Cannot plan source batch without readable source text");
  }

  for (let round = 0; round < MAX_SUBTOPIC_ROUNDS; round += 1) {
    if (accepted.length >= requestedCount) {
      break;
    }

    const remaining = requestedCount - accepted.length;
    const candidateCount = Math.min(
      Math.max(remaining * 3, remaining + 2),
      MAX_SUBTOPIC_CANDIDATES,
    );
    const minimumCount = Math.min(candidateCount, Math.max(1, remaining));
    const { object } = await generateObject({
      model: params.model,
      schema: z.object({
        subtopics: z
          .array(z.string().min(2).max(80))
          .min(minimumCount)
          .max(MAX_SUBTOPIC_CANDIDATES),
      }),
      prompt: [
        "You are planning multiple distinct quiz angles from one source document.",
        `Source title: ${title}`,
        `Need ${remaining} additional quiz subtopics.`,
        "Rules:",
        "- Every subtopic must focus on a meaningfully different angle of the source.",
        "- Spread coverage across the source instead of repeating the same core facts.",
        "- Keep each subtopic short, specific, and quiz-friendly.",
        "- Avoid rephrasing any subtopic from the avoid list.",
        "- Return family-friendly, broadly understandable subtopics only.",
        "",
        "Avoid list:",
        avoidList.length > 0 ? avoidList.join("\n") : "none",
        "",
        "Source content:",
        sourceText,
      ].join("\n"),
    });

    for (const rawSubtopic of object.subtopics) {
      if (accepted.length >= requestedCount) {
        break;
      }

      const cleaned = normalizeValue(rawSubtopic);
      if (!cleaned) {
        continue;
      }

      const isDuplicate =
        existing.some((entry) => subtopicsTooSimilar(entry, cleaned)) ||
        accepted.some((entry) => subtopicsTooSimilar(entry, cleaned));

      if (isDuplicate) {
        continue;
      }

      accepted.push(cleaned);
      avoidList.push(cleaned);
    }
  }

  if (accepted.length < requestedCount) {
    throw new Error("Could not plan enough distinct quiz angles from this source");
  }

  return accepted.slice(0, requestedCount);
}

export const generateUniqueUrlSubtopics = generateUniqueSourceSubtopics;
