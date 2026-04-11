import { relations, sql } from "drizzle-orm";
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
import { quizzes } from "./quiz";
import type {
  SocialCaptionSnapshot,
  SocialPipelineAllowedGameMode,
  SocialPostStatus,
  SocialPreviewManifest,
  SocialPublishMode,
  SocialQuizSnapshot,
} from "@/lib/social/types";

const defaultAllowedGameModes = sql`'["single","wwtbam"]'::jsonb`;
const defaultThresholds = sql`'[25,10,5,0]'::jsonb`;
const defaultAlertedThresholds = sql`'[]'::jsonb`;
const defaultEmptyCaptionSnapshot = sql`'{"caption":null,"firstComment":null,"tiktokTitle":null}'::jsonb`;

export const socialPostStatusEnum = pgEnum("social_post_status", [
  "reserved",
  "preview_ready",
  "drafted",
  "published",
  "failed",
  "skipped",
]);

export const socialPublishModeEnum = pgEnum("social_publish_mode", [
  "draft",
  "publish",
  "schedule",
]);

export const socialPipelines = pgTable(
  "social_pipelines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    allowedGameModes: jsonb("allowed_game_modes")
      .$type<SocialPipelineAllowedGameMode[]>()
      .notNull()
      .default(defaultAllowedGameModes),
    minQuestionCount: integer("min_question_count").notNull().default(3),
    maxQuestionCount: integer("max_question_count").notNull().default(5),
    lowInventoryThresholds: jsonb("low_inventory_thresholds")
      .$type<number[]>()
      .notNull()
      .default(defaultThresholds),
    alertedThresholds: jsonb("alerted_thresholds")
      .$type<number[]>()
      .notNull()
      .default(defaultAlertedThresholds),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("social_pipelines_slug_uq").on(table.slug),
    index("social_pipelines_is_active_idx").on(table.isActive),
  ],
);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => socialPipelines.id, { onDelete: "cascade" }),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    status: socialPostStatusEnum("status").$type<SocialPostStatus>().notNull().default("reserved"),
    previewToken: text("preview_token").notNull(),
    reservationExpiresAt: timestamp("reservation_expires_at"),
    selectedQuestionCount: integer("selected_question_count").notNull(),
    playUrl: text("play_url").notNull(),
    quizSnapshot: jsonb("quiz_snapshot").$type<SocialQuizSnapshot>().notNull(),
    previewManifest: jsonb("preview_manifest").$type<SocialPreviewManifest>(),
    copySnapshot: jsonb("copy_snapshot")
      .$type<SocialCaptionSnapshot>()
      .notNull()
      .default(defaultEmptyCaptionSnapshot),
    publishMode: socialPublishModeEnum("publish_mode").$type<SocialPublishMode>(),
    publerWorkspaceId: text("publer_workspace_id"),
    publerJobId: text("publer_job_id"),
    publerResponse: jsonb("publer_response").$type<Record<string, unknown>>(),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("social_posts_pipeline_quiz_uq").on(table.pipelineId, table.quizId),
    uniqueIndex("social_posts_preview_token_uq").on(table.previewToken),
    index("social_posts_pipeline_status_idx").on(table.pipelineId, table.status),
    index("social_posts_reservation_expires_at_idx").on(table.reservationExpiresAt),
    index("social_posts_published_at_idx").on(table.publishedAt),
  ],
);

export const socialPostAttempts = pgTable(
  "social_post_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    socialPostId: uuid("social_post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    success: boolean("success").notNull(),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>(),
    responsePayload: jsonb("response_payload").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("social_post_attempts_social_post_id_idx").on(table.socialPostId),
    index("social_post_attempts_stage_idx").on(table.stage),
    index("social_post_attempts_created_at_idx").on(table.createdAt),
  ],
);

export const socialPipelinesRelations = relations(socialPipelines, ({ many }) => ({
  posts: many(socialPosts),
}));

export const socialPostsRelations = relations(socialPosts, ({ one, many }) => ({
  pipeline: one(socialPipelines, {
    fields: [socialPosts.pipelineId],
    references: [socialPipelines.id],
  }),
  quiz: one(quizzes, {
    fields: [socialPosts.quizId],
    references: [quizzes.id],
  }),
  attempts: many(socialPostAttempts),
}));

export const socialPostAttemptsRelations = relations(socialPostAttempts, ({ one }) => ({
  socialPost: one(socialPosts, {
    fields: [socialPostAttempts.socialPostId],
    references: [socialPosts.id],
  }),
}));
