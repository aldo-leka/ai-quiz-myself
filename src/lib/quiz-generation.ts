import { generateObject, type LanguageModel, type LanguageModelUsage } from "ai";
import { eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import { createQuizGenerationPrompt } from "@/lib/quiz-ai-prompts";

export const QUIZ_QUESTION_COUNT = {
  single: 14,
  wwtbam: 14,
  couch_coop: 12,
} as const;

export type QuizGenerationGameMode = keyof typeof QUIZ_QUESTION_COUNT;
export type QuizGenerationDifficulty = "easy" | "medium" | "hard" | "mixed" | "escalating";

export const generatedQuestionSchema = z.object({
  questionText: z.string().min(12),
  options: z
    .array(
      z.object({
        text: z.string().min(1),
        explanation: z.string().min(12),
      }),
    )
    .length(4),
  correctOptionIndex: z.number().int().min(0).max(3),
  difficulty: z.enum(["easy", "medium", "hard"]),
  subject: z.string().min(2),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export type GeneratedQuiz = {
  title: string;
  theme: string;
  questions: GeneratedQuestion[];
};

export type GeneratedQuizResult = {
  quiz: GeneratedQuiz;
  usage: LanguageModelUsage;
};

const WWTBAM_QUESTION_PREFIX_PATTERN =
  /^(?:for\s+(?:the\s+)?(?:[£$€]\s*)?\d[\d,]*(?:\s*(?:pounds?|dollars?|euros?|quid))?(?:\s+(?:question|round))?|question\s+\d+\s+(?:for|worth)\s+(?:[£$€]\s*)?\d[\d,]*(?:\s*(?:pounds?|dollars?|euros?|quid))?)\s*[,.:;!?-–—…]*/i;

function sanitizeWwtbamQuestionText(questionText: string): string {
  const trimmed = questionText.trim();
  if (!WWTBAM_QUESTION_PREFIX_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const stripped = trimmed.replace(WWTBAM_QUESTION_PREFIX_PATTERN, "").trim();
  if (
    /^(which|what|who|where|when|why|how|is|are|does|do|did|can|could|would|will|name|identify|in|on|at)\b/i.test(
      stripped,
    )
  ) {
    return stripped;
  }

  return trimmed;
}

function sanitizeQuestionTextForGameMode(
  gameMode: QuizGenerationGameMode,
  questionText: string,
): string {
  if (gameMode === "wwtbam") {
    return sanitizeWwtbamQuestionText(questionText);
  }

  return questionText.trim();
}

export async function getExistingQuestionsForTheme(theme: string): Promise<string[]> {
  const normalizedTheme = theme.trim();
  if (!normalizedTheme) {
    return [];
  }

  const pattern = `%${normalizedTheme}%`;
  const rows = await db
    .select({
      questionText: questions.questionText,
    })
    .from(questions)
    .innerJoin(quizzes, eq(questions.quizId, quizzes.id))
    .where(or(eq(quizzes.theme, normalizedTheme), ilike(quizzes.theme, pattern)))
    .limit(200);

  const seen = new Set<string>();
  const existingQuestions: string[] = [];

  for (const row of rows) {
    const questionText = row.questionText.trim();
    if (!questionText) continue;
    const key = questionText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    existingQuestions.push(questionText);
  }

  return existingQuestions;
}

function normalizedDifficultyForPosition(
  index: number,
  questionCount: number,
  target: QuizGenerationDifficulty,
): "easy" | "medium" | "hard" {
  if (target === "easy" || target === "medium" || target === "hard") {
    return target;
  }

  const easyThreshold = Math.floor(questionCount / 3);
  const mediumThreshold = Math.floor((questionCount * 2) / 3);
  if (target === "mixed") {
    if (index < easyThreshold) return "easy";
    if (index < mediumThreshold) return "medium";
    return "hard";
  }

  if (index < easyThreshold) return "easy";
  if (index < mediumThreshold) return "medium";
  return "hard";
}

export function normalizeGeneratedQuiz(
  quiz: GeneratedQuiz,
  difficulty: QuizGenerationDifficulty,
  gameMode: QuizGenerationGameMode,
): GeneratedQuiz {
  const questionCount = quiz.questions.length;

  return {
    title: quiz.title.trim(),
    theme: quiz.theme.trim(),
    questions: quiz.questions.map((question, index) => ({
      ...question,
      difficulty: normalizedDifficultyForPosition(index, questionCount, difficulty),
      questionText: sanitizeQuestionTextForGameMode(gameMode, question.questionText),
      subject: question.subject.trim(),
      options: question.options.map((option) => ({
        text: option.text.trim(),
        explanation: option.explanation.trim(),
      })),
    })),
  };
}

export async function generateQuizFromPrompt(input: {
  theme: string;
  gameMode: QuizGenerationGameMode;
  difficulty: QuizGenerationDifficulty;
  model: LanguageModel;
  existingQuestions?: string[];
  sourceText?: string;
}): Promise<GeneratedQuizResult> {
  const questionCount = QUIZ_QUESTION_COUNT[input.gameMode];
  const generatedQuizSchema = z.object({
    title: z.string().min(4),
    theme: z.string().min(3),
    questions: z.array(generatedQuestionSchema).length(questionCount),
  });

  const requestConfig = {
    model: input.model,
    schema: generatedQuizSchema,
    prompt: createQuizGenerationPrompt({
      theme: input.theme,
      gameMode: input.gameMode,
      difficulty: input.difficulty,
      questionCount,
      existingQuestions: input.existingQuestions,
      sourceText: input.sourceText,
    }),
  } satisfies Parameters<typeof generateObject>[0];

  const { object, usage } = await generateObject(requestConfig);

  return {
    quiz: normalizeGeneratedQuiz(object, input.difficulty, input.gameMode),
    usage,
  };
}
