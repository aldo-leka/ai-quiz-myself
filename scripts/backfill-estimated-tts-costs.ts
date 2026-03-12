import "dotenv/config";
import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { questions, quizzes } from "@/db/schema";
import { buildEstimatedQuizTtsCostBreakdown, type SupportedQuizGameMode } from "@/lib/quiz-tts";

const shouldForce = process.argv.includes("--force");

async function main() {
  const quizRows = await db
    .select({
      id: quizzes.id,
      gameMode: quizzes.gameMode,
      estimatedTtsCostUsdMicros: quizzes.estimatedTtsCostUsdMicros,
    })
    .from(quizzes)
    .where(shouldForce ? undefined : isNull(quizzes.estimatedTtsCostUsdMicros))
    .orderBy(asc(quizzes.createdAt));

  if (quizRows.length === 0) {
    console.log("No quizzes require estimated TTS backfill.");
    return;
  }

  let updated = 0;

  for (const quiz of quizRows) {
    const questionRows = await db
      .select({
        id: questions.id,
        position: questions.position,
        questionText: questions.questionText,
        options: questions.options,
      })
      .from(questions)
      .where(eq(questions.quizId, quiz.id))
      .orderBy(asc(questions.position));

    if (questionRows.length === 0) {
      continue;
    }

    const estimatedTtsCostBreakdown = buildEstimatedQuizTtsCostBreakdown({
      gameMode: quiz.gameMode as SupportedQuizGameMode,
      questions: questionRows.map((question) => ({
        id: question.id,
        position: question.position,
        questionText: question.questionText,
        options: question.options,
      })),
    });

    await db
      .update(quizzes)
      .set({
        estimatedTtsCostUsdMicros: estimatedTtsCostBreakdown.totalUsdMicros,
        estimatedTtsCostBreakdown,
      })
      .where(eq(quizzes.id, quiz.id));

    updated += 1;
    console.log(
      `Backfilled quiz ${quiz.id} with estimated TTS ${estimatedTtsCostBreakdown.totalUsdMicros ?? "null"} micros.`,
    );
  }

  console.log(`Backfilled estimated TTS costs for ${updated} quizzes.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
