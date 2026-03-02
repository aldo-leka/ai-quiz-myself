import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
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

export const questionDifficultyEnum = pgEnum("question_difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const quizHubStatusEnum = pgEnum("quiz_hub_status", [
  "pending",
  "approved",
  "rejected",
]);

export const apiKeyProviderEnum = pgEnum("api_key_provider", [
  "openai",
  "anthropic",
  "google",
]);

export const quizGenerationStatusEnum = pgEnum("quiz_generation_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const quizGenerationSourceTypeEnum = pgEnum("quiz_generation_source_type", [
  "theme",
  "pdf",
  "url",
]);

export const creditTransactionTypeEnum = pgEnum("credit_transaction_type", [
  "purchase",
  "generation",
]);

export const quizVoteEnum = pgEnum("quiz_vote", ["like", "dislike"]);

export const quizzes = pgTable(
  "quizzes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: text("creator_id").references(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    theme: text("theme").notNull(),
    language: text("language").notNull().default("en"),
    difficulty: quizDifficultyEnum("difficulty").notNull(),
    gameMode: quizGameModeEnum("game_mode").notNull(),
    questionCount: integer("question_count").notNull(),
    sourceType: quizSourceTypeEnum("source_type").notNull(),
    sourceUrl: text("source_url"),
    isHub: boolean("is_hub").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(true),
    hubStatus: quizHubStatusEnum("hub_status"),
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
    index("quizzes_language_idx").on(table.language),
    index("quizzes_theme_idx").on(table.theme),
    index("quizzes_play_count_idx").on(table.playCount),
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
    difficulty: questionDifficultyEnum("difficulty").notNull(),
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
    players: jsonb("players")
      .$type<Array<{ name: string; isOwner: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    totalScore: integer("total_score").notNull().default(0),
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
    playerName: text("player_name").notNull().default("Contestant"),
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

export const quizGenerationJobs = pgTable(
  "quiz_generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: quizGenerationStatusEnum("status").notNull().default("pending"),
    sourceType: quizGenerationSourceTypeEnum("source_type").notNull(),
    inputData: jsonb("input_data").$type<Record<string, unknown>>().notNull(),
    provider: text("provider").notNull(),
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("quiz_generation_jobs_user_id_idx").on(table.userId),
    index("quiz_generation_jobs_status_idx").on(table.status),
    index("quiz_generation_jobs_created_at_idx").on(table.createdAt),
  ],
);

export const quizEmbeddings = pgTable(
  "quiz_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quiz_embeddings_quiz_id_uq").on(table.quizId),
    index("quiz_embeddings_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const credits = pgTable(
  "credits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    balance: integer("balance").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("credits_user_id_uq").on(table.userId),
    index("credits_balance_idx").on(table.balance),
  ],
);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    type: creditTransactionTypeEnum("type").notNull(),
    description: text("description").notNull(),
    generationJobId: uuid("generation_job_id").references(() => quizGenerationJobs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("credit_transactions_user_id_idx").on(table.userId),
    index("credit_transactions_type_idx").on(table.type),
    index("credit_transactions_created_at_idx").on(table.createdAt),
    index("credit_transactions_generation_job_id_idx").on(table.generationJobId),
  ],
);

export const quizVotes = pgTable(
  "quiz_votes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    anonId: text("anon_id"),
    vote: quizVoteEnum("vote").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("quiz_votes_quiz_id_idx").on(table.quizId),
    index("quiz_votes_user_id_idx").on(table.userId),
    index("quiz_votes_anon_id_idx").on(table.anonId),
    uniqueIndex("quiz_votes_quiz_user_uq")
      .on(table.quizId, table.userId)
      .where(sql`${table.userId} is not null`),
    uniqueIndex("quiz_votes_quiz_anon_uq")
      .on(table.quizId, table.anonId)
      .where(sql`${table.anonId} is not null`),
    check(
      "quiz_votes_actor_check",
      sql`(("user_id" is not null and "anon_id" is null) or ("user_id" is null and "anon_id" is not null))`,
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
  generationJobs: many(quizGenerationJobs),
  embeddings: many(quizEmbeddings),
  votes: many(quizVotes),
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

export const quizGenerationJobsRelations = relations(
  quizGenerationJobs,
  ({ one, many }) => ({
    user: one(user, {
      fields: [quizGenerationJobs.userId],
      references: [user.id],
    }),
    quiz: one(quizzes, {
      fields: [quizGenerationJobs.quizId],
      references: [quizzes.id],
    }),
    creditTransactions: many(creditTransactions),
  }),
);

export const quizEmbeddingsRelations = relations(quizEmbeddings, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizEmbeddings.quizId],
    references: [quizzes.id],
  }),
}));

export const creditsRelations = relations(credits, ({ one }) => ({
  user: one(user, {
    fields: [credits.userId],
    references: [user.id],
  }),
}));

export const creditTransactionsRelations = relations(
  creditTransactions,
  ({ one }) => ({
    user: one(user, {
      fields: [creditTransactions.userId],
      references: [user.id],
    }),
    generationJob: one(quizGenerationJobs, {
      fields: [creditTransactions.generationJobId],
      references: [quizGenerationJobs.id],
    }),
  }),
);

export const quizVotesRelations = relations(quizVotes, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [quizVotes.quizId],
    references: [quizzes.id],
  }),
  user: one(user, {
    fields: [quizVotes.userId],
    references: [user.id],
  }),
}));
