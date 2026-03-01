import type { InferSelectModel } from "drizzle-orm";
import type {
  apiKeys,
  questions,
  quizzes,
  quizSessionAnswers,
  quizSessions,
} from "@/db/schema";

export type QuizRecord = InferSelectModel<typeof quizzes>;
export type QuestionRecord = InferSelectModel<typeof questions>;
export type ApiKeyRecord = InferSelectModel<typeof apiKeys>;
export type QuizSessionRecord = InferSelectModel<typeof quizSessions>;
export type QuizSessionAnswerRecord = InferSelectModel<typeof quizSessionAnswers>;

export type HostMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HostActionType =
  | "WELCOME"
  | "BEGIN_QUESTION"
  | "FINAL_ANSWER_CONFIRM"
  | "LIFELINE_ASK_HOST"
  | "LIFELINE_5050";

export type QuestionOption = {
  text: string;
  explanation: string;
};

export type PlayableQuestion = QuestionRecord & {
  options: QuestionOption[];
};

export type QuizWithQuestions = QuizRecord & {
  questions: PlayableQuestion[];
};

export type CurrentHostSetting = {
  moneyValue: number;
  remainingTime?: number | null;
  difficulty?: string;
  question?: string;
  options?: string[];
  correctAnswer?: string;
};

export type SaveQuizSessionPayload = {
  quizId: string;
  gameMode: "wwtbam" | "single" | "couch_coop";
  score: number;
  players?: Array<{
    name: string;
    isOwner: boolean;
  }>;
  startedAt: string;
  finishedAt: string;
  answers: Array<{
    questionId: string;
    playerName?: string;
    selectedOptionIndex: number | null;
    isCorrect: boolean;
    timeTakenMs: number;
    createdAt?: string;
  }>;
};
