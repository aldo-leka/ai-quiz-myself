import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const quizDifficultyEnum = pgEnum("quiz_difficulty", [
  "easy",
  "medium",
  "hard",
  "mixed",
  "escalating",
]);

export const quizGameModeEnum = pgEnum("quiz_game_mode", [
  "single",
  "wwtbam",
  "couch_coop",
]);

export const quizSourceTypeEnum = pgEnum("quiz_source_type", [
  "ai_generated",
  "pdf",
  "url",
  "manual",
]);

export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "openai",
  "anthropic",
  "google",
]);

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: text("creator_id").references(() => user.id),
    title: text("title").notNull(),
    theme: text("theme").notNull(),
    language: text("language").notNull().default("en"),
    difficulty: quizDifficultyEnum("difficulty").notNull(),
    gameMode: quizGameModeEnum("game_mode").notNull(),
    questionCount: integer("question_count").notNull(),
    sourceType: quizSourceTypeEnum("source_type").notNull(),
    isHub: boolean("is_hub").notNull().default(false),
    playCount: integer("play_count").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    dislikes: integer("dislikes").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("quizzes_creator_id_idx").on(table.creatorId),
    index("quizzes_game_mode_idx").on(table.gameMode),
    index("quizzes_is_hub_idx").on(table.isHub),
    index("quizzes_hub_mode_idx").on(table.isHub, table.gameMode),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionText: text("question_text").notNull(),
    imageUrl: text("image_url"),
    options: jsonb("options")
      .$type<Array<{ text: string; explanation: string }>>()
      .notNull(),
    correctOptionIndex: integer("correct_option_index").notNull(),
    difficulty: quizDifficultyEnum("difficulty").notNull(),
    subject: text("subject"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("questions_quiz_id_idx").on(table.quizId),
    uniqueIndex("questions_quiz_id_position_uq").on(table.quizId, table.position),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: apiKeyProviderEnum("provider").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_user_id_idx").on(table.userId),
    uniqueIndex("api_keys_user_provider_uq").on(table.userId, table.provider),
  ],
);

export const quizSessions = pgTable(
  "quiz_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id),
    userId: text("user_id").references(() => user.id),
    gameMode: quizGameModeEnum("game_mode").notNull(),
    score: integer("score").notNull().default(0),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("quiz_sessions_quiz_id_idx").on(table.quizId),
    index("quiz_sessions_user_id_idx").on(table.userId),
    index("quiz_sessions_started_at_idx").on(table.startedAt),
  ],
);

export const quizSessionAnswers = pgTable(
  "quiz_session_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => quizSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    selectedOptionIndex: integer("selected_option_index"),
    isCorrect: boolean("is_correct").notNull(),
    timeTakenMs: integer("time_taken_ms").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("quiz_session_answers_session_id_idx").on(table.sessionId),
    index("quiz_session_answers_question_id_idx").on(table.questionId),
    uniqueIndex("quiz_session_answers_session_question_uq").on(
      table.sessionId,
      table.questionId,
    ),
  ],
);

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  creator: one(user, {
    fields: [quizzes.creatorId],
    references: [user.id],
  }),
  questions: many(questions),
  sessions: many(quizSessions),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
  sessionAnswers: many(quizSessionAnswers),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(user, {
    fields: [apiKeys.userId],
    references: [user.id],
  }),
}));

export const quizSessionsRelations = relations(quizSessions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [quizSessions.quizId],
    references: [quizzes.id],
  }),
  user: one(user, {
    fields: [quizSessions.userId],
    references: [user.id],
  }),
  answers: many(quizSessionAnswers),
}));

export const quizSessionAnswersRelations = relations(
  quizSessionAnswers,
  ({ one }) => ({
    session: one(quizSessions, {
      fields: [quizSessionAnswers.sessionId],
      references: [quizSessions.id],
    }),
    question: one(questions, {
      fields: [quizSessionAnswers.questionId],
      references: [questions.id],
    }),
  }),
);
