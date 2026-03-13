import { db } from "@/db";
import { hubCandidates, questions, quizzes } from "@/db/schema";
import {
  normalizeGenerationCostBreakdown,
  type EstimatedTtsCostBreakdown,
  type GenerationCostBreakdown,
} from "@/lib/ai-pricing";
import {
  hubCandidateSnapshotSchema,
  type HubCandidateSnapshot,
  type HubCandidateSnapshotQuestion,
} from "@/lib/hub-candidate-snapshot";
import type { GeneratedQuiz } from "@/lib/quiz-generation";

type BuildHubCandidateSnapshotParams = {
  generated: GeneratedQuiz;
  language: string;
  difficulty: "easy" | "medium" | "hard" | "mixed" | "escalating";
  gameMode: "single" | "wwtbam" | "couch_coop";
  generationProvider?: "openai" | "anthropic" | "google" | null;
  generationModel?: string | null;
  generationCostUsdMicros?: number | null;
  generationCostBreakdown?: GenerationCostBreakdown | null;
  estimatedTtsCostUsdMicros?: number | null;
  estimatedTtsCostBreakdown?: EstimatedTtsCostBreakdown | null;
  sourceType: "ai_generated" | "url" | "pdf" | "manual";
  sourceUrl?: string | null;
};

export function buildHubCandidateSnapshot(
  params: BuildHubCandidateSnapshotParams,
): HubCandidateSnapshot {
  return {
    title: params.generated.title,
    theme: params.generated.theme,
    language: params.language,
    difficulty: params.difficulty,
    gameMode: params.gameMode,
    generationProvider: params.generationProvider ?? null,
    generationModel: params.generationModel ?? null,
    generationCostUsdMicros: params.generationCostUsdMicros ?? null,
    generationCostBreakdown: params.generationCostBreakdown
      ? normalizeGenerationCostBreakdown(params.generationCostBreakdown)
      : null,
    estimatedTtsCostUsdMicros: params.estimatedTtsCostUsdMicros ?? null,
    estimatedTtsCostBreakdown: params.estimatedTtsCostBreakdown ?? null,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl ?? null,
    questionCount: params.generated.questions.length,
    questions: params.generated.questions.map(
      (question, index): HubCandidateSnapshotQuestion => ({
        position: index + 1,
        questionText: question.questionText,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        hostHintReasoning: null,
        hostHintGuessedOptionIndex: null,
        difficulty: question.difficulty,
        subject: question.subject ?? null,
      }),
    ),
  };
}

export function parseHubCandidateSnapshot(value: unknown): HubCandidateSnapshot {
  return hubCandidateSnapshotSchema.parse(value);
}

export function getHubCandidateQuestionTexts(snapshot: HubCandidateSnapshot): string[] {
  return snapshot.questions
    .map((question) => question.questionText.trim())
    .filter((questionText) => questionText.length > 0);
}

export async function createHubCandidate(params: {
  sourceQuizId: string;
  submittedByUserId: string;
  snapshot: HubCandidateSnapshot;
}) {
  const [candidate] = await db
    .insert(hubCandidates)
    .values({
      sourceQuizId: params.sourceQuizId,
      submittedByUserId: params.submittedByUserId,
      title: params.snapshot.title,
      theme: params.snapshot.theme,
      language: params.snapshot.language,
      difficulty: params.snapshot.difficulty,
      gameMode: params.snapshot.gameMode,
      sourceType: params.snapshot.sourceType,
      sourceUrl: params.snapshot.sourceUrl,
      questionCount: params.snapshot.questionCount,
      snapshot: params.snapshot,
      status: "pending",
      decision: null,
      reviewReason: null,
      publishedQuizId: null,
      reviewedAt: null,
    })
    .returning({
      id: hubCandidates.id,
    });

  return candidate;
}

export async function publishHubCandidateSnapshot(
  snapshot: HubCandidateSnapshot,
  params?: {
    creatorId?: string | null;
  },
) {
  const [publishedQuiz] = await db
    .insert(quizzes)
    .values({
      creatorId: params?.creatorId ?? null,
      title: snapshot.title,
      description: null,
      theme: snapshot.theme,
      language: snapshot.language,
      difficulty: snapshot.difficulty,
      gameMode: snapshot.gameMode,
      generationProvider: snapshot.generationProvider ?? null,
      generationModel: snapshot.generationModel ?? null,
      generationCostUsdMicros: snapshot.generationCostUsdMicros ?? null,
      generationCostBreakdown: snapshot.generationCostBreakdown
        ? normalizeGenerationCostBreakdown(snapshot.generationCostBreakdown)
        : undefined,
      estimatedTtsCostUsdMicros: snapshot.estimatedTtsCostUsdMicros ?? null,
      estimatedTtsCostBreakdown: snapshot.estimatedTtsCostBreakdown ?? undefined,
      questionCount: snapshot.questions.length,
      sourceType: snapshot.sourceType,
      sourceUrl: snapshot.sourceUrl,
      isHub: true,
      isPublic: true,
    })
    .returning({
      id: quizzes.id,
    });

  await db.insert(questions).values(
    snapshot.questions.map((question) => ({
      quizId: publishedQuiz.id,
      position: question.position,
      questionText: question.questionText,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
      hostHintReasoning: question.hostHintReasoning ?? null,
      hostHintGuessedOptionIndex: question.hostHintGuessedOptionIndex ?? null,
      difficulty: question.difficulty,
      subject: question.subject,
    })),
  );

  return publishedQuiz.id;
}
