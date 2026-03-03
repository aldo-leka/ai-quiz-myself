import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

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

const modePromptLeads: Record<QuizGenerationGameMode, string> = {
  single: "You are a senior quiz designer building a fast single-player trivia quiz.",
  wwtbam: 'You are a senior TV game-show producer building a "Who Wants to Be a Millionaire" style quiz.',
  couch_coop: "You are a senior quiz writer creating a couch co-op trivia round for families.",
};

const modeExtraRequirements: Record<QuizGenerationGameMode, string[]> = {
  single: [
    "Keep the pace brisk and varied.",
  ],
  wwtbam: [
    "Questions should feel dramatic and TV-ready.",
  ],
  couch_coop: [
    "Questions should be short enough to read comfortably on a TV.",
    "Avoid joke answers and keep distractors plausible.",
  ],
};

function buildDifficultyPolicy(
  difficulty: QuizGenerationDifficulty,
  questionCount: number,
): string {
  if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
    return `Set every question difficulty to "${difficulty}".`;
  }

  if (difficulty === "mixed") {
    return `Balance difficulty across the quiz with about 1/3 easy, 1/3 medium, and 1/3 hard.`;
  }

  const easyCount = Math.max(1, Math.floor(questionCount / 3));
  const mediumCount = Math.max(1, Math.floor(questionCount / 3));
  const hardStart = easyCount + mediumCount + 1;

  return `Difficulty must escalate across the quiz:
- Questions 1-${easyCount}: easy
- Questions ${easyCount + 1}-${easyCount + mediumCount}: medium
- Questions ${hardStart}-${questionCount}: hard`;
}

export function createQuizGenerationPrompt(input: {
  theme: string;
  gameMode: QuizGenerationGameMode;
  difficulty: QuizGenerationDifficulty;
  questionCount?: number;
}): string {
  const questionCount = input.questionCount ?? QUIZ_QUESTION_COUNT[input.gameMode];
  const lines = [
    modePromptLeads[input.gameMode],
    "",
    `Create one polished quiz with exactly ${questionCount} multiple-choice questions for the theme: ${input.theme}.`,
    "",
    "Requirements:",
    "- Family friendly and educational.",
    "- Exactly 4 options per question.",
    "- Only one correct option.",
    "- Options should be plausible distractors that trigger discussion.",
    "- Explanations must teach something useful, including why the correct answer is correct.",
    "- Keep subjects varied within the theme.",
    "- Avoid repetitive phrasing and avoid trick wording.",
    ...modeExtraRequirements[input.gameMode].map((requirement) => `- ${requirement}`),
    `- ${buildDifficultyPolicy(input.difficulty, questionCount)}`,
    "",
    "Return ONLY valid JSON matching this shape:",
    "{",
    '  "title": "string",',
    '  "theme": "string",',
    '  "questions": [',
    "    {",
    '      "questionText": "string",',
    '      "options": [',
    '        { "text": "string", "explanation": "string" },',
    '        { "text": "string", "explanation": "string" },',
    '        { "text": "string", "explanation": "string" },',
    '        { "text": "string", "explanation": "string" }',
    "      ],",
    '      "correctOptionIndex": 0,',
    '      "difficulty": "easy|medium|hard",',
    '      "subject": "string"',
    "    }",
    "  ]",
    "}",
  ];

  return lines.join("\n");
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
): GeneratedQuiz {
  const questionCount = quiz.questions.length;

  return {
    title: quiz.title.trim(),
    theme: quiz.theme.trim(),
    questions: quiz.questions.map((question, index) => ({
      ...question,
      difficulty: normalizedDifficultyForPosition(index, questionCount, difficulty),
      questionText: question.questionText.trim(),
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
  temperature?: number;
}): Promise<GeneratedQuiz> {
  const questionCount = QUIZ_QUESTION_COUNT[input.gameMode];
  const generatedQuizSchema = z.object({
    title: z.string().min(4),
    theme: z.string().min(3),
    questions: z.array(generatedQuestionSchema).length(questionCount),
  });

  const { object } = await generateObject({
    model: input.model,
    schema: generatedQuizSchema,
    prompt: createQuizGenerationPrompt({
      theme: input.theme,
      gameMode: input.gameMode,
      difficulty: input.difficulty,
      questionCount,
    }),
    temperature: input.temperature ?? 0.6,
  });

  return normalizeGeneratedQuiz(object, input.difficulty);
}
