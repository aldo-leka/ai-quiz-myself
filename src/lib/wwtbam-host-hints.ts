import { generateObject, type LanguageModelUsage } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { createWwtbamHostHintsPrompt } from "@/lib/quiz-ai-prompts";

type HostHintQuestion = {
  position: number;
  questionText: string;
  options: Array<{
    text: string;
  }>;
};

export type GeneratedWwtbamHostHint = {
  position: number;
  reasoning: string;
  guessedOptionIndex: number;
};

export const generatedWwtbamHostHintSchema = z.object({
  position: z.number().int().positive(),
  reasoning: z.string().trim().min(1).max(320),
  guessedOptionIndex: z.number().int().min(0).max(3),
});

const generatedWwtbamHostHintsSchema = z.object({
  hints: z.array(generatedWwtbamHostHintSchema).min(1),
});

const LEANING_PREFIX_PATTERN =
  /^(?:i(?:'|’)d|i would)\s+(?:lean|go(?:\s+with)?|pick|guess)\s+[a-d](?:\)|\.|:|,)?\s*/i;
const OPTION_PREFIX_PATTERN = /^(?:option\s+)?[a-d](?:\)|\.|:|,)\s*/i;

function normalizeSentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const firstCharacter = normalized[0] ?? "";
  const capitalized =
    firstCharacter.length > 0
      ? `${firstCharacter.toUpperCase()}${normalized.slice(firstCharacter.length)}`
      : normalized;

  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function normalizeWwtbamHostHintReasoning(reasoning: string): string {
  const stripped = reasoning
    .replace(LEANING_PREFIX_PATTERN, "")
    .replace(OPTION_PREFIX_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeSentence(stripped);
}

export function buildStoredAskHostScript(params: {
  displayedOptionIndex: number;
  reasoning: string;
}): string {
  const letter = String.fromCharCode(65 + params.displayedOptionIndex);
  const normalizedReasoning = normalizeWwtbamHostHintReasoning(params.reasoning);

  if (!normalizedReasoning) {
    return `I'd lean ${letter}.`;
  }

  return `I'd lean ${letter}. ${normalizedReasoning}`;
}

export function hasStoredWwtbamHostHint(question: {
  hostHintReasoning?: string | null;
  hostHintDisplayedOptionIndex?: number | null;
  hostHintGuessedOptionIndex?: number | null;
}): boolean {
  const reasoning = question.hostHintReasoning?.trim();
  const index =
    question.hostHintDisplayedOptionIndex ?? question.hostHintGuessedOptionIndex ?? null;

  return Boolean(reasoning) && typeof index === "number" && index >= 0 && index <= 3;
}

export function getWwtbamHostHintModelName(): string {
  return process.env.HOST_OPENAI_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

export async function generateWwtbamHostHints(params: {
  apiKey: string;
  title: string;
  theme: string;
  questions: HostHintQuestion[];
}): Promise<{
  hints: GeneratedWwtbamHostHint[];
  modelName: string;
  usage: LanguageModelUsage | undefined;
}> {
  const modelName = getWwtbamHostHintModelName();
  const openai = createOpenAI({ apiKey: params.apiKey });

  const { object, usage } = await generateObject({
    model: openai(modelName),
    schema: generatedWwtbamHostHintsSchema,
    prompt: createWwtbamHostHintsPrompt({
      title: params.title,
      theme: params.theme,
      questions: params.questions,
    }),
  });

  const hintsByPosition = new Map<number, GeneratedWwtbamHostHint>();
  for (const hint of object.hints) {
    const normalizedReasoning = normalizeWwtbamHostHintReasoning(hint.reasoning);
    if (!normalizedReasoning) continue;

    hintsByPosition.set(hint.position, {
      position: hint.position,
      guessedOptionIndex: hint.guessedOptionIndex,
      reasoning: normalizedReasoning,
    });
  }

  const hints = params.questions.map((question) => {
    const existing = hintsByPosition.get(question.position);

    if (existing) {
      return existing;
    }

    throw new Error(`Missing generated WWTBAM host hint for question ${question.position}`);
  });

  return {
    hints,
    modelName,
    usage,
  };
}
