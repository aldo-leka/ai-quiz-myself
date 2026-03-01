CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."credit_transaction_type" AS ENUM('purchase', 'generation');--> statement-breakpoint
CREATE TYPE "public"."question_difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."quiz_generation_source_type" AS ENUM('theme', 'pdf', 'url');--> statement-breakpoint
CREATE TYPE "public"."quiz_generation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."quiz_hub_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" "credit_transaction_type" NOT NULL,
	"description" text NOT NULL,
	"generation_job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" "quiz_generation_status" DEFAULT 'pending' NOT NULL,
	"source_type" "quiz_generation_source_type" NOT NULL,
	"input_data" jsonb NOT NULL,
	"provider" text NOT NULL,
	"quiz_id" uuid,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" RENAME COLUMN "score" TO "total_score";--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "difficulty" SET DATA TYPE "public"."question_difficulty" USING "difficulty"::text::"public"."question_difficulty";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_session_answers" ADD COLUMN "player_name" text DEFAULT 'Contestant' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "players" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "hub_status" "quiz_hub_status";--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_generation_job_id_quiz_generation_jobs_id_fk" FOREIGN KEY ("generation_job_id") REFERENCES "public"."quiz_generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_embeddings" ADD CONSTRAINT "quiz_embeddings_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_generation_jobs" ADD CONSTRAINT "quiz_generation_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_generation_jobs" ADD CONSTRAINT "quiz_generation_jobs_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_transactions_user_id_idx" ON "credit_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "credit_transactions_generation_job_id_idx" ON "credit_transactions" USING btree ("generation_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credits_user_id_uq" ON "credits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credits_balance_idx" ON "credits" USING btree ("balance");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_embeddings_quiz_id_uq" ON "quiz_embeddings" USING btree ("quiz_id");--> statement-breakpoint
CREATE INDEX "quiz_embeddings_embedding_hnsw_idx" ON "quiz_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "quiz_generation_jobs_user_id_idx" ON "quiz_generation_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "quiz_generation_jobs_status_idx" ON "quiz_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quiz_generation_jobs_created_at_idx" ON "quiz_generation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "quizzes_language_idx" ON "quizzes" USING btree ("language");--> statement-breakpoint
CREATE INDEX "quizzes_theme_idx" ON "quizzes" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "quizzes_play_count_idx" ON "quizzes" USING btree ("play_count");
