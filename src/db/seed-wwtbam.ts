import "dotenv/config";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { db } from "./index";
import { questions, quizzes } from "./schema";
import { generateQuizFromPrompt } from "../lib/quiz-generation";

const THEMES = [
  "Science and Nature",
  "World History and Culture",
  "Technology, Media, and Modern Life",
] as const;

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function generateQuiz(theme: string, modelName: string) {
  const google = createGoogleGenerativeAI({
    apiKey: assertEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  });

  return generateQuizFromPrompt({
    theme,
    gameMode: "wwtbam",
    difficulty: "escalating",
    model: google(modelName),
    temperature: 0.6,
  });
}

async function saveQuiz(quiz: Awaited<ReturnType<typeof generateQuiz>>) {
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
