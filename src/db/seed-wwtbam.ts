import "dotenv/config";
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { db } from "./index";
import { questions, quizzes } from "./schema";

const QUESTION_COUNT = 14;

const THEMES = [
  "Science and Nature",
  "World History and Culture",
  "Technology, Media, and Modern Life",
] as const;

const GeneratedQuestionSchema = z.object({
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

const GeneratedQuizSchema = z.object({
  title: z.string().min(4),
  theme: z.string().min(3),
  questions: z.array(GeneratedQuestionSchema).length(QUESTION_COUNT),
});

type GeneratedQuiz = z.infer<typeof GeneratedQuizSchema>;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function createPrompt(theme: string): string {
  return `You are a senior TV game-show producer building a "Who Wants to Be a Millionaire" style quiz.

Create one polished quiz with exactly ${QUESTION_COUNT} multiple-choice questions for the theme: ${theme}.

Requirements:
- Family friendly and educational.
- Exactly 4 options per question.
- Only one correct option.
- Options should be plausible distractors that trigger discussion.
- Explanations must teach something useful, including why the correct answer is correct.
- Difficulty must escalate across the quiz:
  - Questions 1-4: easy
  - Questions 5-9: medium
  - Questions 10-14: hard
- Keep subjects varied within the theme.
- Avoid repetitive phrasing and avoid trick wording.

Return ONLY valid JSON matching this shape:
{
  "title": "string",
  "theme": "string",
  "questions": [
    {
      "questionText": "string",
      "options": [
        { "text": "string", "explanation": "string" },
        { "text": "string", "explanation": "string" },
        { "text": "string", "explanation": "string" },
        { "text": "string", "explanation": "string" }
      ],
      "correctOptionIndex": 0,
      "difficulty": "easy|medium|hard",
      "subject": "string"
    }
  ]
}`;
}

function normalizeQuiz(quiz: GeneratedQuiz): GeneratedQuiz {
  const normalizedQuestions = quiz.questions.map((question, index) => {
    let difficulty: "easy" | "medium" | "hard" = "hard";
    if (index <= 3) difficulty = "easy";
    else if (index <= 8) difficulty = "medium";

    return {
      ...question,
      difficulty,
      questionText: question.questionText.trim(),
      subject: question.subject.trim(),
      options: question.options.map((option) => ({
        text: option.text.trim(),
        explanation: option.explanation.trim(),
      })),
    };
  });

  return {
    title: quiz.title.trim(),
    theme: quiz.theme.trim(),
    questions: normalizedQuestions,
  };
}

async function generateQuiz(theme: string, modelName: string): Promise<GeneratedQuiz> {
  const google = createGoogleGenerativeAI({
    apiKey: assertEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  });

  const { object } = await generateObject({
    model: google(modelName),
    schema: GeneratedQuizSchema,
    prompt: createPrompt(theme),
    temperature: 0.6,
  });

  return normalizeQuiz(object);
}

async function saveQuiz(quiz: GeneratedQuiz) {
  const [createdQuiz] = await db
    .insert(quizzes)
    .values({
      title: quiz.title,
      theme: quiz.theme,
      language: "en",
      difficulty: "escalating",
      gameMode: "wwtbam",
      questionCount: quiz.questions.length,
      sourceType: "ai_generated",
      isHub: true,
    })
    .returning({ id: quizzes.id });

  await db.insert(questions).values(
    quiz.questions.map((question, index) => ({
      quizId: createdQuiz.id,
      position: index + 1,
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      difficulty: question.difficulty,
      subject: question.subject,
    })),
  );

  return createdQuiz.id;
}

async function main() {
  const modelName = process.env.GOOGLE_MODEL ?? "gemini-2.0-flash";
  console.log(`Seeding ${THEMES.length} WWTBAM hub quizzes with model: ${modelName}`);

  for (const theme of THEMES) {
    console.log(`Generating quiz for theme: ${theme}`);
    const quiz = await generateQuiz(theme, modelName);
    const quizId = await saveQuiz(quiz);
    console.log(`Saved quiz ${quizId} (${quiz.title}) with ${quiz.questions.length} questions.`);
  }

  console.log("Seed complete.");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
