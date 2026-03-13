import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { hubCandidates, questions, quizzes } from "@/db/schema";
import {
  generateWwtbamHostHints,
  hasStoredWwtbamHostHint,
  type GeneratedWwtbamHostHint,
} from "@/lib/wwtbam-host-hints";
import type { HubCandidateSnapshot } from "@/lib/hub-candidate-snapshot";

type QuestionOption = {
  text: string;
  explanation: string;
};

export type WwtbamQuestionWithHostHint = {
  id: string;
  position: number;
  questionText: string;
  options: QuestionOption[];
  correctOptionIndex: number;
  hostHintReasoning: string | null;
  hostHintGuessedOptionIndex: number | null;
};

export type WwtbamQuizHostHintContext = {
  id: string;
  title: string;
  theme: string;
  creatorId: string | null;
  questions: WwtbamQuestionWithHostHint[];
};

function normalizeOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const option = item as { text?: unknown; explanation?: unknown };
      const text = typeof option.text === "string" ? option.text : "";
      const explanation = typeof option.explanation === "string" ? option.explanation : "";

      return { text, explanation };
    })
    .filter((option): option is QuestionOption => option !== null);
}

export async function loadWwtbamQuizHostHintContext(
  quizId: string,
): Promise<WwtbamQuizHostHintContext | null> {
  const [quiz] = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      theme: quizzes.theme,
      gameMode: quizzes.gameMode,
      creatorId: quizzes.creatorId,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);

  if (!quiz || quiz.gameMode !== "wwtbam") {
    return null;
  }

  const questionRows = await db
    .select({
      id: questions.id,
      position: questions.position,
      questionText: questions.questionText,
      options: questions.options,
      correctOptionIndex: questions.correctOptionIndex,
      hostHintReasoning: questions.hostHintReasoning,
      hostHintGuessedOptionIndex: questions.hostHintGuessedOptionIndex,
    })
    .from(questions)
    .where(eq(questions.quizId, quiz.id))
    .orderBy(asc(questions.position));

  return {
    id: quiz.id,
    title: quiz.title,
    theme: quiz.theme,
    creatorId: quiz.creatorId,
    questions: questionRows.map((question) => ({
      ...question,
      options: normalizeOptions(question.options),
    })),
  };
}

function shouldRegenerateHostHint(
  question: WwtbamQuestionWithHostHint,
  force: boolean,
): boolean {
  return force || !hasStoredWwtbamHostHint(question);
}

async function updateHubCandidateSnapshots(params: {
  quizId: string;
  updatesByPosition: Map<number, GeneratedWwtbamHostHint>;
  force: boolean;
}) {
  const candidates = await db
    .select({
      id: hubCandidates.id,
      snapshot: hubCandidates.snapshot,
      publishedQuizId: hubCandidates.publishedQuizId,
    })
    .from(hubCandidates)
    .where(eq(hubCandidates.sourceQuizId, params.quizId));

  for (const candidate of candidates) {
    const snapshot = candidate.snapshot as HubCandidateSnapshot;
    if (!snapshot || !Array.isArray(snapshot.questions)) {
      continue;
    }

    let snapshotChanged = false;
    const nextQuestions = snapshot.questions.map((question) => {
      const generatedHint = params.updatesByPosition.get(question.position);
      if (!generatedHint) {
        return question;
      }

      const hasStoredHint =
        typeof question.hostHintReasoning === "string" &&
        question.hostHintReasoning.trim().length > 0 &&
        typeof question.hostHintGuessedOptionIndex === "number";

      if (hasStoredHint && !params.force) {
        return question;
      }

      snapshotChanged = true;

      return {
        ...question,
        hostHintReasoning: generatedHint.reasoning,
        hostHintGuessedOptionIndex: generatedHint.guessedOptionIndex,
      };
    });

    if (snapshotChanged) {
      await db
        .update(hubCandidates)
        .set({
          snapshot: {
            ...snapshot,
            questions: nextQuestions,
          },
        })
        .where(eq(hubCandidates.id, candidate.id));
    }

    if (!candidate.publishedQuizId) {
      continue;
    }

    const publishedQuestions = await db
      .select({
        id: questions.id,
        position: questions.position,
        hostHintReasoning: questions.hostHintReasoning,
        hostHintGuessedOptionIndex: questions.hostHintGuessedOptionIndex,
      })
      .from(questions)
      .where(eq(questions.quizId, candidate.publishedQuizId))
      .orderBy(asc(questions.position));

    for (const publishedQuestion of publishedQuestions) {
      const generatedHint = params.updatesByPosition.get(publishedQuestion.position);
      if (!generatedHint) {
        continue;
      }

      const hasStoredHint =
        typeof publishedQuestion.hostHintReasoning === "string" &&
        publishedQuestion.hostHintReasoning.trim().length > 0 &&
        typeof publishedQuestion.hostHintGuessedOptionIndex === "number";

      if (hasStoredHint && !params.force) {
        continue;
      }

      await db
        .update(questions)
        .set({
          hostHintReasoning: generatedHint.reasoning,
          hostHintGuessedOptionIndex: generatedHint.guessedOptionIndex,
        })
        .where(eq(questions.id, publishedQuestion.id));
    }
  }
}

export async function generateAndPersistWwtbamHostHints(params: {
  quizId: string;
  apiKey: string;
  force?: boolean;
}) {
  const context = await loadWwtbamQuizHostHintContext(params.quizId);
  if (!context) {
    return { ok: false as const, reason: "quiz_not_found_or_not_wwtbam" };
  }

  const force = params.force ?? false;
  const questionsToGenerate = context.questions.filter((question) =>
    shouldRegenerateHostHint(question, force),
  );

  if (questionsToGenerate.length === 0) {
    return {
      ok: true as const,
      generatedCount: 0,
      updatedCount: 0,
    };
  }

  const generatedResult = await generateWwtbamHostHints({
    apiKey: params.apiKey,
    title: context.title,
    theme: context.theme,
    questions: questionsToGenerate.map((question) => ({
      position: question.position,
      questionText: question.questionText,
      options: question.options.map((option) => ({
        text: option.text,
      })),
    })),
  });

  const updatesByPosition = new Map<number, GeneratedWwtbamHostHint>();
  for (const hint of generatedResult.hints) {
    updatesByPosition.set(hint.position, hint);
  }

  const questionIdsToUpdate: string[] = [];
  for (const question of questionsToGenerate) {
    if (updatesByPosition.has(question.position)) {
      questionIdsToUpdate.push(question.id);
    }
  }

  if (questionIdsToUpdate.length === 0) {
    return {
      ok: true as const,
      generatedCount: generatedResult.hints.length,
      updatedCount: 0,
    };
  }

  const rowsToUpdate = await db
    .select({
      id: questions.id,
      position: questions.position,
    })
    .from(questions)
    .where(inArray(questions.id, questionIdsToUpdate));

  for (const question of rowsToUpdate) {
    const generatedHint = updatesByPosition.get(question.position);
    if (!generatedHint) {
      continue;
    }

    await db
      .update(questions)
      .set({
        hostHintReasoning: generatedHint.reasoning,
        hostHintGuessedOptionIndex: generatedHint.guessedOptionIndex,
      })
      .where(eq(questions.id, question.id));
  }

  await updateHubCandidateSnapshots({
    quizId: context.id,
    updatesByPosition,
    force,
  });

  return {
    ok: true as const,
    generatedCount: generatedResult.hints.length,
    updatedCount: rowsToUpdate.length,
  };
}
