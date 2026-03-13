import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quizzes } from "@/db/schema";
import { generateAndPersistWwtbamHostHints } from "@/lib/wwtbam-host-hint-service";

const shouldForce = process.argv.includes("--force");
const apiKey = process.env.OPENAI_API_KEY?.trim();

async function main() {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to backfill WWTBAM host hints");
  }

  const quizRows = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
    })
    .from(quizzes)
    .where(eq(quizzes.gameMode, "wwtbam"))
    .orderBy(asc(quizzes.createdAt));

  if (quizRows.length === 0) {
    console.log("No WWTBAM quizzes found.");
    return;
  }

  let touchedQuizCount = 0;

  for (const quiz of quizRows) {
    const result = await generateAndPersistWwtbamHostHints({
      quizId: quiz.id,
      apiKey,
      force: shouldForce,
    });

    if (!result.ok) {
      console.warn(`Skipped quiz ${quiz.id} (${quiz.title}): ${result.reason}`);
      continue;
    }

    if (result.updatedCount > 0 || shouldForce) {
      touchedQuizCount += 1;
    }

    console.log(
      `Processed quiz ${quiz.id} (${quiz.title}): generated=${result.generatedCount}, updated=${result.updatedCount}`,
    );
  }

  console.log(`Processed ${quizRows.length} WWTBAM quizzes. Updated ${touchedQuizCount}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
